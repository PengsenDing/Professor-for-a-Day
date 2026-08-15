"""Fake adapters and repository for the session API tests (AC §5: no live providers)."""

import copy
from typing import Any

from app.services.critic import CriticVerdict
from app.services.evaluation import (
    DemonstratedPoint,
    IntroducedMisconception,
    JudgeEvaluation,
)
from app.services.exceptions import (
    GenerationError,
    SpeechSynthesisError,
    TranscriptionError,
)
from app.services.student import StudentReply

EMPTY_EVALUATION = JudgeEvaluation(
    newly_demonstrated_points=[],
    corrected_misconceptions=[],
    unresolved_misconceptions=[],
    newly_introduced_misconceptions=[],
    recommended_next_probe="Ask for a concrete example.",
)


def make_evaluation(
    points: list[str] | None = None,
    corrected: list[str] | None = None,
    introduced: list[str] | None = None,
    suggested: str | None = None,
    trigger: str = "",
) -> JudgeEvaluation:
    return JudgeEvaluation(
        newly_demonstrated_points=[
            DemonstratedPoint(point_id=point_id, evidence="learner quote")
            for point_id in points or []
        ],
        corrected_misconceptions=corrected or [],
        unresolved_misconceptions=[],
        newly_introduced_misconceptions=[
            IntroducedMisconception(summary=summary) for summary in introduced or []
        ],
        recommended_next_probe="Probe the next idea.",
        most_likely_misconception_id=suggested,
        misconception_trigger_quote=trigger,
    )


class FakeSessionRepository:
    """In-memory mirror of `SessionRepository` semantics."""

    def __init__(self) -> None:
        self.sessions: dict[str, dict[str, Any]] = {}
        self._counter = 0

    async def ensure_indexes(self) -> None:
        pass

    async def create(self, *, concept_id: str, mode: str, student_text: str) -> dict[str, Any]:
        self._counter += 1
        session_id = f"fake-session-{self._counter}"
        document: dict[str, Any] = {
            "_id": session_id,
            "concept_id": concept_id,
            "mode": mode,
            "status": "active",
            "end_reason": None,
            "learner_turn_count": 0,
            "progress_percent": 0,
            "confirmed_point_ids": [],
            "posed_misconception_ids": [],
            "resolved_misconception_ids": [],
            "introduced_misconception_summaries": [],
            "opening_text": student_text,
            "turns": [],
            "report": None,
            "final_score": None,
        }
        self.sessions[session_id] = document
        return copy.deepcopy(document)

    async def get(self, session_id: str) -> dict[str, Any] | None:
        document = self.sessions.get(session_id)
        return copy.deepcopy(document) if document else None

    async def append_turn(
        self,
        session_id: str,
        *,
        expected_learner_turn_count: int,
        turn: dict[str, Any],
        session_fields: dict[str, Any],
    ) -> bool:
        document = self.sessions.get(session_id)
        if (
            document is None
            or document["status"] != "active"
            or document["learner_turn_count"] != expected_learner_turn_count
        ):
            return False
        document["turns"].append(copy.deepcopy(turn))
        document.update(copy.deepcopy(session_fields))
        document["learner_turn_count"] += 1
        return True

    async def finish(
        self,
        session_id: str,
        *,
        end_reason: str,
        final_percent: int,
        report: dict[str, Any],
    ) -> dict[str, Any] | None:
        document = self.sessions.get(session_id)
        if document is None:
            return None
        if document["status"] == "active":
            document.update(
                status="ended",
                end_reason=end_reason,
                progress_percent=final_percent,
                final_score=final_percent,
                report=copy.deepcopy(report),
            )
        return copy.deepcopy(document)


class FakeJudge:
    def __init__(self, call_log: list[str]) -> None:
        self.call_log = call_log
        self.responses: list[JudgeEvaluation] = []
        self.calls: list[dict[str, Any]] = []
        self.fail = False

    def queue(self, *evaluations: JudgeEvaluation) -> None:
        self.responses.extend(evaluations)

    async def evaluate(self, *, rubric, state, transcript, learner_text) -> JudgeEvaluation:
        self.call_log.append("judge")
        self.calls.append(
            {
                "concept_id": rubric.concept_id,
                "state": state,
                "transcript": list(transcript),
                "learner_text": learner_text,
            }
        )
        if self.fail:
            raise GenerationError("scripted judge failure")
        if self.responses:
            return self.responses.pop(0)
        return EMPTY_EVALUATION


class FakeStudent:
    def __init__(self, call_log: list[str]) -> None:
        self.call_log = call_log
        self.opening_calls: list[dict[str, Any]] = []
        self.reply_calls: list[dict[str, Any]] = []
        self.fail_opening = False
        self.fail_reply = False
        # Attach to simulate a critic-reviewed (and possibly regenerated) reply.
        self.critic_verdict: CriticVerdict | None = None
        self.regenerated = False

    async def opening_question(self, *, rubric, concept_title, mode) -> str:
        self.call_log.append("student_opening")
        self.opening_calls.append(
            {"concept_id": rubric.concept_id, "mode": mode, "probes": rubric.probes[mode]}
        )
        if self.fail_opening:
            raise GenerationError("scripted opening failure")
        return f"Can you explain {concept_title} to me?"

    async def reply(
        self,
        *,
        rubric,
        concept_title,
        mode,
        transcript,
        learner_text,
        probe_focus,
        pose,
        press,
        session_ended,
        pose_trigger=None,
    ) -> StudentReply:
        self.call_log.append("student_reply")
        self.reply_calls.append(
            {
                "mode": mode,
                "probe_focus": probe_focus,
                "pose": pose,
                "pose_trigger": pose_trigger,
                "press": press,
                "session_ended": session_ended,
                "transcript": list(transcript),
            }
        )
        if self.fail_reply:
            raise GenerationError("scripted reply failure")
        if session_ended:
            text = "Thanks for teaching me!"
        elif pose is not None:
            text = f"But I thought: {pose.summary}"
        elif press is not None:
            text = f"I still think: {press.summary}"
        else:
            text = "Interesting — can you tell me more?"
        return StudentReply(
            text=text, regenerated=self.regenerated, critic=self.critic_verdict
        )


class FakeSpeechService:
    TRANSCRIPT = "Gradient descent steps opposite the gradient."
    AUDIO = b"ID3\x04fake-mp3-bytes"

    def __init__(self) -> None:
        self.fail_transcribe = False
        self.fail_synthesize = False
        self.synthesized_texts: list[str] = []

    async def transcribe(self, audio: bytes) -> str:
        if self.fail_transcribe:
            raise TranscriptionError("scripted transcription failure")
        return self.TRANSCRIPT

    async def synthesize(self, text: str) -> bytes:
        if self.fail_synthesize:
            raise SpeechSynthesisError("scripted synthesis failure")
        self.synthesized_texts.append(text)
        return self.AUDIO
