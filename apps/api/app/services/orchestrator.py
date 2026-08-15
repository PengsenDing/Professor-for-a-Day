"""Teaching Session orchestration (AC-SES / AC-TRN / AC-END / AC-IDM).

The turn loop is Judge → scoring → AI Student → one atomic persist. Turns for a
session are serialized behind a per-session lock (AC-TRN-10); retries with the
same `client_turn_id` replay the stored envelope without any provider call
(AC-IDM-1…4).
"""

import asyncio
import logging
from typing import Any

from ..curriculum.rubrics import Rubric, RubricMisconception
from ..errors import ApiError
from ..repositories.sessions import SessionRepository
from ..schemas import (
    ActiveMisconception,
    Concept,
    ConceptRef,
    Curriculum,
    EndReason,
    ErrorCode,
    GraphUpdate,
    InputMode,
    Mode,
    Progress,
    RubricPointRef,
    SessionCreated,
    SessionFinished,
    SessionSnapshot,
    SessionStatus,
    SnapshotTurn,
    StartSessionRequest,
    SubmitTurnRequest,
    TeacherReport,
    TurnEnvelope,
)
from .evaluation import DemonstratedPoint
from .exceptions import GenerationError
from .graphs import BUILTIN_GRAPH_ID, GraphService
from .judge import JudgeAdapter
from .report import EvidenceSource, build_report
from .scoring import ScoringState, apply_evaluation, pose_misconception
from .slug import slugify
from .student import StudentAdapter

logger = logging.getLogger(__name__)

# Module-level so every request handler serializes on the same lock (AC-TRN-10).
_SESSION_LOCKS: dict[str, asyncio.Lock] = {}

# Canned concession for a mastery ending: every point is confirmed and the posed
# challenge resolved, so the closing is scripted rather than generated.
MASTERY_CLOSING_LINE = "Ohh — I think I actually get it now. Thanks for teaching me!"


class SessionOrchestrator:
    def __init__(
        self,
        *,
        repository: SessionRepository,
        judge: JudgeAdapter,
        student: StudentAdapter,
        graph_service: GraphService,
        max_learner_turns: int,
    ) -> None:
        self._repository = repository
        self._judge = judge
        self._student = student
        self._graphs = graph_service
        self._max_turns = max_learner_turns

    # -- session start ------------------------------------------------------

    async def start(self, request: StartSessionRequest) -> SessionCreated:
        if request.topic is not None:
            concept, rubric, topic = await self._prepare_freeform(request.topic)
        else:
            concept, rubric, topic = await self._prepare_graph_concept(request)

        try:
            student_text = await self._student.opening_question(
                rubric=rubric, concept_title=concept.title, mode=request.mode
            )
        except GenerationError as error:
            # No session document exists yet, so nothing half-initialized remains (AC-SES-8).
            raise _generation_failed() from error

        document = await self._repository.create(
            concept_id=concept.id,
            concept_title=concept.title,
            mode=request.mode.value,
            student_text=student_text,
            graph_id=request.graph_id,
            topic=topic,
            rubric=rubric.model_dump() if topic is not None else None,
        )
        session_id = str(document["_id"])
        logger.info(
            "session started session_id=%s graph_id=%s concept_id=%s mode=%s",
            session_id,
            request.graph_id,
            concept.id,
            request.mode.value,
        )
        return SessionCreated(
            session_id=session_id,
            graph_id=request.graph_id,
            concept=ConceptRef(id=concept.id, title=concept.title),
            mode=request.mode,
            student_text=student_text,
            progress=Progress(percent=0),
            learner_turn_count=0,
            turns_remaining=self._max_turns,
            status="active",
            active_misconception=None,
        )

    async def _prepare_graph_concept(
        self, request: StartSessionRequest
    ) -> tuple[Concept, Rubric, None]:
        assert request.graph_id is not None and request.concept_id is not None
        curriculum = await self._graphs.get_curriculum(request.graph_id)
        if curriculum is None:
            raise ApiError(422, ErrorCode.INVALID_GRAPH, "Unknown knowledge graph.")
        concept = _find_concept(curriculum, request.concept_id)
        if concept is None:
            raise ApiError(422, ErrorCode.INVALID_CONCEPT, "Unknown concept.")
        try:
            # First-time user-graph concepts generate (and cache) a rubric here.
            rubric = await self._graphs.get_rubric(request.graph_id, concept.id)
        except GenerationError as error:
            raise _generation_failed() from error
        except LookupError as error:
            # The graph was deleted between validation and the rubric fetch.
            raise ApiError(
                422, ErrorCode.INVALID_GRAPH, "Unknown knowledge graph."
            ) from error
        return concept, rubric, None

    async def _prepare_freeform(self, topic: str) -> tuple[Concept, Rubric, str]:
        topic_title = topic.strip()
        concept = Concept(
            id=slugify(topic_title), title=topic_title, summary=topic_title
        )
        try:
            rubric = await self._graphs.generate_topic_rubric(
                topic_title=topic_title, concept_id=concept.id
            )
        except GenerationError as error:
            raise _generation_failed() from error
        return concept, rubric, topic_title

    # -- turn submission ----------------------------------------------------

    async def submit_turn(self, session_id: str, request: SubmitTurnRequest) -> TurnEnvelope:
        lock = _SESSION_LOCKS.setdefault(session_id, asyncio.Lock())
        async with lock:
            document = await self._get_or_404(session_id)

            replay = _find_turn_by_client_id(document, str(request.client_turn_id))
            if replay is not None:
                return self._envelope_from_stored_turn(document, replay)

            if document["status"] != "active":
                raise ApiError(409, ErrorCode.SESSION_ENDED, "The session has ended.")

            rubric = await self._rubric_for(document)
            mode = Mode(document["mode"])
            state = _state_from_document(document)
            transcript = _transcript_from_document(document)

            try:
                evaluation = await self._judge.evaluate(
                    rubric=rubric,
                    state=state,
                    transcript=transcript,
                    learner_text=request.learner_text,
                )
            except GenerationError as error:
                # Nothing persisted: the session stays in its pre-turn state (AC-ERR-6).
                raise _generation_failed() from error

            result = apply_evaluation(rubric, state, evaluation)
            for discarded in (*result.discarded_point_ids, *result.discarded_misconception_ids):
                logger.warning(
                    "discarded hallucinated rubric id session_id=%s id=%s",
                    session_id,
                    discarded,
                )

            turn_number = document["learner_turn_count"] + 1
            percent = max(result.percent, document["progress_percent"])  # monotonic
            ended, end_reason = self._exit_state(percent, turn_number)

            # The mirror mechanism (A): the Judge may flag which tracked
            # misconception the learner's own explanation invites. It is advice
            # only — validated against the rubric here, and the orchestrator
            # still decides whether anything is posed at all.
            suggested_id = evaluation.most_likely_misconception_id
            if suggested_id is not None and suggested_id not in rubric.misconception_ids():
                logger.warning(
                    "discarded hallucinated rubric id session_id=%s id=%s",
                    session_id,
                    suggested_id,
                )
                suggested_id = None

            # An ended session poses nothing new; an active one poses the next
            # challenge, or keeps pressing the outstanding one so the Student
            # cannot drift into conceding on its own (only the Judge resolves it).
            pose = (
                None
                if ended
                else self._pick_misconception_to_pose(
                    rubric, result.state, percent, suggested_id
                )
            )
            state_after = (
                pose_misconception(result.state, pose.id) if pose is not None else result.state
            )
            press: RubricMisconception | None = None
            if not ended and pose is None:
                press = _rubric_misconception(rubric, state_after.active_misconception_id())

            # The mirror mechanism (B): anchor the posed misconception to the
            # learner's own words — but only when the quote is verbatim from the
            # submission, so the Student can never misquote the teacher.
            pose_trigger: str | None = None
            if pose is not None and pose.id == suggested_id:
                quote = evaluation.misconception_trigger_quote.strip()
                if quote and quote in request.learner_text:
                    pose_trigger = quote

            # The probe target is selected here, in code, as a learner-safe point
            # label. The Judge's free-text recommendation is persisted with the
            # evaluation but never forwarded to the Student, so rubric answer text
            # cannot leak through it.
            uncovered = [
                point for point in rubric.points
                if point.id not in state_after.confirmed_point_ids
            ]
            probe_focus = uncovered[0].label if uncovered else None

            if ended and end_reason is EndReason.mastery:
                # The moment of victory is scripted, not generated: the Judge just
                # resolved the challenge, so the concession can never drift.
                student_text = MASTERY_CLOSING_LINE
            else:
                try:
                    student_text = await self._student.reply(
                        rubric=rubric,
                        concept_title=_concept_title(document),
                        mode=mode,
                        transcript=transcript,
                        learner_text=request.learner_text,
                        probe_focus=probe_focus,
                        pose=pose,
                        pose_trigger=pose_trigger,
                        press=press,
                        session_ended=ended,
                    )
                except GenerationError as error:
                    raise _generation_failed() from error

            active = _active_misconception(rubric, state_after)
            newly_covered = [
                RubricPointRef(id=point.id, label=point.label)
                for point in rubric.points
                if point.id in result.newly_confirmed_point_ids
            ]
            report = (
                build_report(
                    rubric=rubric,
                    catalog=await self._curriculum_for(document),
                    concept_id=document["concept_id"],
                    state=state_after,
                    final_percent=percent,
                    evidence_sources=[
                        *_evidence_sources_from_document(document),
                        EvidenceSource(
                            turn_number,
                            request.learner_text,
                            evaluation.newly_demonstrated_points,
                        ),
                    ],
                )
                if ended
                else None
            )

            # Session-end graph work happens before the exit write so the
            # outcome persists atomically with the ending turn; failures
            # degrade to None and never block the report (ADR-0005).
            graph_update: GraphUpdate | None = None
            if ended:
                graph_update = await self._finalize_graph(
                    document,
                    [
                        *transcript,
                        ("teacher", request.learner_text),
                        ("student", student_text),
                    ],
                )

            turn_document = {
                "turn_number": turn_number,
                "client_turn_id": str(request.client_turn_id),
                "learner_text": request.learner_text,
                "input_mode": request.input_mode.value,
                "student_text": student_text,
                "evaluation": evaluation.model_dump(),
                "progress_percent": percent,
                "newly_covered_points": [point.model_dump() for point in newly_covered],
                "active_misconception": active.model_dump() if active else None,
                "status_after": "ended" if ended else "active",
                "end_reason_after": end_reason.value if end_reason else None,
                "created_at": _now(),
            }
            session_fields: dict[str, Any] = {
                "progress_percent": percent,
                "confirmed_point_ids": sorted(state_after.confirmed_point_ids),
                "posed_misconception_ids": list(state_after.posed_misconception_ids),
                "resolved_misconception_ids": sorted(state_after.resolved_misconception_ids),
                "introduced_misconception_summaries": list(
                    state_after.introduced_misconception_summaries
                ),
            }
            if ended:
                session_fields |= {
                    "status": "ended",
                    "end_reason": end_reason.value if end_reason else None,
                    "final_score": percent,
                    "report": report.model_dump() if report else None,
                    "graph_update": graph_update.model_dump() if graph_update else None,
                }
                if graph_update is not None and graph_update.created:
                    # A freeform session now belongs to the graph it produced.
                    session_fields["graph_id"] = graph_update.graph_id

            persisted = await self._repository.append_turn(
                session_id,
                expected_learner_turn_count=document["learner_turn_count"],
                turn=turn_document,
                session_fields=session_fields,
            )
            if not persisted:
                raise ApiError(
                    409, ErrorCode.SESSION_ENDED, "The session changed; please resubmit."
                )

            logger.info(
                "turn accepted session_id=%s concept_id=%s mode=%s turn_number=%d "
                "progress_percent=%d",
                session_id,
                document["concept_id"],
                document["mode"],
                turn_number,
                percent,
            )
            if ended:
                logger.info(
                    "session ended session_id=%s end_reason=%s progress_percent=%d",
                    session_id,
                    end_reason.value if end_reason else None,
                    percent,
                )

            return TurnEnvelope(
                turn_number=turn_number,
                learner_transcript=request.learner_text,
                student_text=student_text,
                progress=Progress(percent=percent),
                newly_covered_points=newly_covered,
                active_misconception=active,
                learner_turn_count=turn_number,
                turns_remaining=self._max_turns - turn_number,
                status=SessionStatus.ended if ended else SessionStatus.active,
                end_reason=end_reason,
                report=report,
                graph_update=graph_update,
            )

    # -- finish -------------------------------------------------------------

    async def finish(self, session_id: str) -> SessionFinished:
        # The same lock submit_turn holds: finishing while a turn is in flight
        # would otherwise persist a report built from the pre-turn state.
        lock = _SESSION_LOCKS.setdefault(session_id, asyncio.Lock())
        async with lock:
            document = await self._get_or_404(session_id)

            if document["status"] == "ended":
                return _finished_from_document(document)

            rubric = await self._rubric_for(document)
            state = _state_from_document(document)
            percent = document["progress_percent"]
            report = build_report(
                rubric=rubric,
                catalog=await self._curriculum_for(document),
                concept_id=document["concept_id"],
                state=state,
                final_percent=percent,
                evidence_sources=_evidence_sources_from_document(document),
            )
            graph_update = await self._finalize_graph(
                document, _transcript_from_document(document)
            )
            updated = await self._repository.finish(
                session_id,
                end_reason=EndReason.learner_finished.value,
                final_percent=percent,
                report=report.model_dump(),
                graph_update=graph_update.model_dump() if graph_update else None,
                graph_id=(
                    graph_update.graph_id
                    if graph_update is not None and graph_update.created
                    else None
                ),
            )
            if updated is None:
                raise _session_not_found()
            logger.info(
                "session ended session_id=%s end_reason=%s progress_percent=%d",
                session_id,
                updated["end_reason"],
                updated["progress_percent"],
            )
            return _finished_from_document(updated)

    # -- snapshot -----------------------------------------------------------

    async def get_snapshot(self, session_id: str) -> SessionSnapshot:
        """Learner-safe read model of a stored session (AC-SES-7 / AC-SES-10).

        Read-only: no provider call, no mutation, no lock. Each turn is
        projected field-by-field so the persisted Judge evaluation can never
        leak into a response.
        """
        document = await self._get_or_404(session_id)
        rubric = await self._rubric_for(document)
        state = _state_from_document(document)
        report = document.get("report")
        graph_update = document.get("graph_update")
        return SessionSnapshot(
            session_id=str(document["_id"]),
            graph_id=document.get("graph_id"),
            concept=_taught_concept(document),
            mode=Mode(document["mode"]),
            opening_text=document["opening_text"],
            turns=[
                SnapshotTurn(
                    turn_number=turn["turn_number"],
                    learner_transcript=turn["learner_text"],
                    input_mode=InputMode(turn["input_mode"]),
                    student_text=turn["student_text"],
                    newly_covered_points=[
                        RubricPointRef.model_validate(point)
                        for point in turn["newly_covered_points"]
                    ],
                )
                for turn in document["turns"]
            ],
            progress=Progress(percent=document["progress_percent"]),
            active_misconception=_active_misconception(rubric, state),
            learner_turn_count=document["learner_turn_count"],
            turns_remaining=max(self._max_turns - document["learner_turn_count"], 0),
            status=SessionStatus(document["status"]),
            end_reason=EndReason(document["end_reason"]) if document["end_reason"] else None,
            report=TeacherReport.model_validate(report) if report else None,
            graph_update=GraphUpdate.model_validate(graph_update) if graph_update else None,
            created_at=document["created_at"],
        )

    # -- speech lookup ------------------------------------------------------

    async def student_speech_for_turn(self, session_id: str, turn_number: int) -> tuple[str, str]:
        """The stored AI Student text for one turn, plus the session's mode.

        The mode selects the server-configured voice character (AC-CFG-5).
        """
        document = await self._get_or_404(session_id)
        if turn_number == 0:
            return document["opening_text"], document["mode"]
        for turn in document["turns"]:
            if turn["turn_number"] == turn_number:
                return turn["student_text"], document["mode"]
        raise ApiError(404, ErrorCode.TURN_NOT_FOUND, "The session has no such turn.")

    # -- helpers ------------------------------------------------------------

    async def _get_or_404(self, session_id: str) -> dict[str, Any]:
        document = await self._repository.get(session_id)
        if document is None:
            raise _session_not_found()
        return document

    async def _rubric_for(self, document: dict[str, Any]) -> Rubric:
        """The session's rubric: the embedded freeform one, or the graph's."""
        embedded = document.get("rubric")
        if embedded:
            return Rubric.model_validate(embedded)
        graph_id = document.get("graph_id") or BUILTIN_GRAPH_ID
        try:
            return await self._graphs.get_rubric(graph_id, document["concept_id"])
        except GenerationError as error:
            raise _generation_failed() from error
        except LookupError as error:
            # The graph (and its rubrics) was deleted while this session was
            # still active: neither turns nor a fresh report are possible.
            # Already-ended sessions replay their stored report and never
            # reach this path; freeform sessions embed their rubric above.
            raise ApiError(
                404,
                ErrorCode.GRAPH_NOT_FOUND,
                "This session's knowledge graph no longer exists.",
            ) from error

    async def _curriculum_for(self, document: dict[str, Any]) -> Curriculum:
        """The graph curriculum the Teacher Report recommends from.

        Freeform sessions get a virtual single-concept curriculum: the report
        is deliberately independent of graph summarization, which has not run
        (or may have failed) by the time the report is built.
        """
        if document.get("topic") is None or document.get("graph_id"):
            graph_id = document.get("graph_id") or BUILTIN_GRAPH_ID
            curriculum = await self._graphs.get_curriculum(graph_id)
            if curriculum is not None:
                return curriculum
        taught = _taught_concept(document)
        return Curriculum(
            concepts=[Concept(id=taught.id, title=taught.title, summary=taught.title)],
            edges=[],
        )

    async def _finalize_graph(
        self, document: dict[str, Any], transcript: list[tuple[str, str]]
    ) -> GraphUpdate | None:
        """Create or grow the session's knowledge graph at session end.

        Never raises: any failure degrades to None so the already-built report
        still reaches the learner (ADR-0005).
        """
        graph_id = document.get("graph_id")
        topic = document.get("topic")
        if graph_id == BUILTIN_GRAPH_ID or (graph_id is None and topic is None):
            return None  # builtin sessions (and pre-graph legacy docs) never summarize

        try:
            if graph_id is None:
                taught = _taught_concept(document)
                return await self._graphs.create_from_session(
                    taught_concept=Concept(
                        id=taught.id, title=taught.title, summary=taught.title
                    ),
                    rubric=Rubric.model_validate(document["rubric"]),
                    transcript=transcript,
                )
            return await self._graphs.grow(
                graph_id=graph_id,
                taught_concept=_taught_concept(document),
                transcript=transcript,
            )
        except Exception:  # noqa: BLE001 - the report must survive any graph failure
            logger.exception(
                "graph finalization failed session_id=%s", str(document["_id"])
            )
            return None

    def _pick_misconception_to_pose(
        self,
        rubric: Rubric,
        state: ScoringState,
        percent: int,
        suggested_id: str | None = None,
    ) -> RubricMisconception | None:
        """Pose the Judge-suggested misconception when the learner's explanation
        invites one; otherwise the first unposed, once none is outstanding.

        At least one challenge must be posed for mastery to be reachable
        (AC-JDG-8); one resolved challenge is sufficient, so nothing new is posed
        after the gate is satisfied.
        """
        if state.gate_satisfied():
            return None
        if state.active_misconception_id() is not None:
            return None
        if suggested_id is not None and suggested_id not in state.posed_misconception_ids:
            suggested = _rubric_misconception(rubric, suggested_id)
            if suggested is not None:
                return suggested
        for misconception in rubric.misconceptions:
            if misconception.id not in state.posed_misconception_ids:
                return misconception
        return None

    def _exit_state(self, percent: int, turn_number: int) -> tuple[bool, EndReason | None]:
        if percent == 100:
            return True, EndReason.mastery
        if turn_number >= self._max_turns:
            return True, EndReason.turn_limit
        return False, None

    def _envelope_from_stored_turn(
        self, document: dict[str, Any], turn: dict[str, Any]
    ) -> TurnEnvelope:
        """Rebuild the exact original envelope for an idempotent retry (AC-IDM-2)."""
        ended_on_this_turn = turn["status_after"] == "ended"
        report = document.get("report") if ended_on_this_turn else None
        graph_update = document.get("graph_update") if ended_on_this_turn else None
        return TurnEnvelope(
            turn_number=turn["turn_number"],
            learner_transcript=turn["learner_text"],
            student_text=turn["student_text"],
            progress=Progress(percent=turn["progress_percent"]),
            newly_covered_points=[
                RubricPointRef.model_validate(point) for point in turn["newly_covered_points"]
            ],
            active_misconception=(
                ActiveMisconception.model_validate(turn["active_misconception"])
                if turn["active_misconception"]
                else None
            ),
            learner_turn_count=turn["turn_number"],
            turns_remaining=self._max_turns - turn["turn_number"],
            status=SessionStatus(turn["status_after"]),
            end_reason=(
                EndReason(turn["end_reason_after"]) if turn["end_reason_after"] else None
            ),
            report=TeacherReport.model_validate(report) if report else None,
            graph_update=GraphUpdate.model_validate(graph_update) if graph_update else None,
        )


def _find_concept(curriculum: Curriculum, concept_id: str) -> Concept | None:
    for concept in curriculum.concepts:
        if concept.id == concept_id:
            return concept
    return None


def _concept_title(document: dict[str, Any]) -> str:
    return document.get("concept_title") or document["concept_id"]


def _taught_concept(document: dict[str, Any]) -> ConceptRef:
    return ConceptRef(id=document["concept_id"], title=_concept_title(document))


def _state_from_document(document: dict[str, Any]) -> ScoringState:
    return ScoringState(
        confirmed_point_ids=frozenset(document["confirmed_point_ids"]),
        posed_misconception_ids=tuple(document["posed_misconception_ids"]),
        resolved_misconception_ids=frozenset(document["resolved_misconception_ids"]),
        introduced_misconception_summaries=tuple(
            document["introduced_misconception_summaries"]
        ),
    )


def _evidence_sources_from_document(document: dict[str, Any]) -> list[EvidenceSource]:
    """Each stored turn's demonstrated points, for the report's evidence trail."""
    return [
        EvidenceSource(
            turn["turn_number"],
            turn["learner_text"],
            [
                DemonstratedPoint.model_validate(point)
                for point in turn["evaluation"].get("newly_demonstrated_points", [])
            ],
        )
        for turn in document["turns"]
    ]


def _transcript_from_document(document: dict[str, Any]) -> list[tuple[str, str]]:
    transcript: list[tuple[str, str]] = [("student", document["opening_text"])]
    for turn in document["turns"]:
        transcript.append(("teacher", turn["learner_text"]))
        transcript.append(("student", turn["student_text"]))
    return transcript


def _rubric_misconception(
    rubric: Rubric, misconception_id: str | None
) -> RubricMisconception | None:
    if misconception_id is None:
        return None
    for misconception in rubric.misconceptions:
        if misconception.id == misconception_id:
            return misconception
    return None


def _active_misconception(rubric: Rubric, state: ScoringState) -> ActiveMisconception | None:
    active_id = state.active_misconception_id()
    if active_id is None:
        return None
    for misconception in rubric.misconceptions:
        if misconception.id == active_id:
            return ActiveMisconception(id=misconception.id, summary=misconception.summary)
    return None


def _find_turn_by_client_id(
    document: dict[str, Any], client_turn_id: str
) -> dict[str, Any] | None:
    for turn in document["turns"]:
        if turn["client_turn_id"] == client_turn_id:
            return turn
    return None


def _finished_from_document(document: dict[str, Any]) -> SessionFinished:
    graph_update = document.get("graph_update")
    return SessionFinished(
        session_id=str(document["_id"]),
        status="ended",
        end_reason=EndReason(document["end_reason"]),
        progress=Progress(percent=document["progress_percent"]),
        report=TeacherReport.model_validate(document["report"]),
        graph_update=GraphUpdate.model_validate(graph_update) if graph_update else None,
    )


def _session_not_found() -> ApiError:
    return ApiError(404, ErrorCode.SESSION_NOT_FOUND, "No such session.")


def _generation_failed() -> ApiError:
    return ApiError(
        502,
        ErrorCode.GENERATION_FAILED,
        "The AI Student is temporarily unavailable. Please resubmit.",
    )


def _now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
