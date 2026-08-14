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
    Mode,
    Progress,
    RubricPointRef,
    SessionCreated,
    SessionFinished,
    SessionStatus,
    StartSessionRequest,
    SubmitTurnRequest,
    TeacherReport,
    TurnEnvelope,
)
from .exceptions import GenerationError
from .judge import JudgeAdapter
from .report import build_report
from .scoring import ScoringState, apply_evaluation, pose_misconception
from .student import StudentAdapter

logger = logging.getLogger(__name__)

# Module-level so every request handler serializes on the same lock (AC-TRN-10).
_SESSION_LOCKS: dict[str, asyncio.Lock] = {}


class SessionOrchestrator:
    def __init__(
        self,
        *,
        repository: SessionRepository,
        judge: JudgeAdapter,
        student: StudentAdapter,
        rubrics: dict[str, Rubric],
        catalog: Curriculum,
        max_learner_turns: int,
    ) -> None:
        self._repository = repository
        self._judge = judge
        self._student = student
        self._rubrics = rubrics
        self._catalog = catalog
        self._max_turns = max_learner_turns

    # -- session start ------------------------------------------------------

    async def start(self, request: StartSessionRequest) -> SessionCreated:
        concept = self._find_concept(request.concept_id)
        if concept is None:
            raise ApiError(422, ErrorCode.INVALID_CONCEPT, "Unknown concept.")
        rubric = self._rubrics[concept.id]

        try:
            student_text = await self._student.opening_question(
                rubric=rubric, concept_title=concept.title, mode=request.mode
            )
        except GenerationError as error:
            # No session document exists yet, so nothing half-initialized remains (AC-SES-8).
            raise _generation_failed() from error

        document = await self._repository.create(
            concept_id=concept.id, mode=request.mode.value, student_text=student_text
        )
        session_id = str(document["_id"])
        logger.info(
            "session started session_id=%s concept_id=%s mode=%s",
            session_id,
            concept.id,
            request.mode.value,
        )
        return SessionCreated(
            session_id=session_id,
            concept=ConceptRef(id=concept.id, title=concept.title),
            mode=request.mode,
            student_text=student_text,
            progress=Progress(percent=0),
            learner_turn_count=0,
            turns_remaining=self._max_turns,
            status="active",
            active_misconception=None,
        )

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

            rubric = self._rubrics[document["concept_id"]]
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

            pose = self._pick_misconception_to_pose(rubric, result.state, percent)
            state_after = (
                pose_misconception(result.state, pose.id) if pose is not None else result.state
            )

            ended, end_reason = self._exit_state(percent, turn_number)
            try:
                student_text = await self._student.reply(
                    rubric=rubric,
                    concept_title=self._concept_title(document["concept_id"]),
                    mode=mode,
                    transcript=transcript,
                    learner_text=request.learner_text,
                    recommended_probe=evaluation.recommended_next_probe,
                    pose=None if ended else pose,
                    session_ended=ended,
                )
            except GenerationError as error:
                raise _generation_failed() from error
            if ended:
                state_after = result.state  # an ended session poses nothing new

            active = _active_misconception(rubric, state_after)
            newly_covered = [
                RubricPointRef(id=point.id, label=point.label)
                for point in rubric.points
                if point.id in result.newly_confirmed_point_ids
            ]
            report = (
                build_report(
                    rubric=rubric,
                    catalog=self._catalog,
                    concept_id=document["concept_id"],
                    state=state_after,
                    final_percent=percent,
                )
                if ended
                else None
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
                }

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
            )

    # -- finish -------------------------------------------------------------

    async def finish(self, session_id: str) -> SessionFinished:
        document = await self._get_or_404(session_id)

        if document["status"] == "ended":
            return _finished_from_document(document)

        rubric = self._rubrics[document["concept_id"]]
        state = _state_from_document(document)
        percent = document["progress_percent"]
        report = build_report(
            rubric=rubric,
            catalog=self._catalog,
            concept_id=document["concept_id"],
            state=state,
            final_percent=percent,
        )
        updated = await self._repository.finish(
            session_id,
            end_reason=EndReason.learner_finished.value,
            final_percent=percent,
            report=report.model_dump(),
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

    # -- speech lookup ------------------------------------------------------

    async def student_text_for_turn(self, session_id: str, turn_number: int) -> str:
        document = await self._get_or_404(session_id)
        if turn_number == 0:
            return document["opening_text"]
        for turn in document["turns"]:
            if turn["turn_number"] == turn_number:
                return turn["student_text"]
        raise ApiError(404, ErrorCode.TURN_NOT_FOUND, "The session has no such turn.")

    # -- helpers ------------------------------------------------------------

    async def _get_or_404(self, session_id: str) -> dict[str, Any]:
        document = await self._repository.get(session_id)
        if document is None:
            raise _session_not_found()
        return document

    def _find_concept(self, concept_id: str) -> Concept | None:
        for concept in self._catalog.concepts:
            if concept.id == concept_id:
                return concept
        return None

    def _concept_title(self, concept_id: str) -> str:
        concept = self._find_concept(concept_id)
        return concept.title if concept else concept_id

    def _pick_misconception_to_pose(
        self, rubric: Rubric, state: ScoringState, percent: int
    ) -> RubricMisconception | None:
        """Pose the first unposed rubric misconception once none is outstanding.

        At least one challenge must be posed for mastery to be reachable
        (AC-JDG-8); one resolved challenge is sufficient, so nothing new is posed
        after the gate is satisfied.
        """
        if state.gate_satisfied():
            return None
        if state.active_misconception_id() is not None:
            return None
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
        )


def _state_from_document(document: dict[str, Any]) -> ScoringState:
    return ScoringState(
        confirmed_point_ids=frozenset(document["confirmed_point_ids"]),
        posed_misconception_ids=tuple(document["posed_misconception_ids"]),
        resolved_misconception_ids=frozenset(document["resolved_misconception_ids"]),
        introduced_misconception_summaries=tuple(
            document["introduced_misconception_summaries"]
        ),
    )


def _transcript_from_document(document: dict[str, Any]) -> list[tuple[str, str]]:
    transcript: list[tuple[str, str]] = [("student", document["opening_text"])]
    for turn in document["turns"]:
        transcript.append(("teacher", turn["learner_text"]))
        transcript.append(("student", turn["student_text"]))
    return transcript


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
    return SessionFinished(
        session_id=str(document["_id"]),
        status="ended",
        end_reason=EndReason(document["end_reason"]),
        progress=Progress(percent=document["progress_percent"]),
        report=TeacherReport.model_validate(document["report"]),
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
