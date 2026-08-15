"""Fake adapters and repositories for the session API tests (AC §5: no live providers)."""

import copy
from datetime import UTC, datetime
from typing import Any

from pymongo.errors import PyMongoError

from app.curriculum.rubrics import Rubric
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
from app.services.graph_summarizer import GraphExtraction

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

    async def create(
        self,
        *,
        concept_id: str,
        concept_title: str,
        mode: str,
        student_text: str,
        graph_id: str | None,
        topic: str | None = None,
        rubric: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._counter += 1
        session_id = f"fake-session-{self._counter}"
        document: dict[str, Any] = {
            "_id": session_id,
            "graph_id": graph_id,
            "concept_id": concept_id,
            "concept_title": concept_title,
            "topic": topic,
            "rubric": rubric,
            "graph_update": None,
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
            "created_at": datetime.now(UTC),
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
        graph_update: dict[str, Any] | None = None,
        graph_id: str | None = None,
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
                graph_update=copy.deepcopy(graph_update),
            )
            if graph_id is not None:
                document["graph_id"] = graph_id
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
    ) -> str:
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
            return "Thanks for teaching me!"
        if pose is not None:
            return f"But I thought: {pose.summary}"
        if press is not None:
            return f"I still think: {press.summary}"
        return "Interesting — can you tell me more?"


class FakeGraphRepository:
    """In-memory mirror of `GraphRepository` semantics (versioning included)."""

    def __init__(self) -> None:
        self.graphs: dict[str, dict[str, Any]] = {}
        self._counter = 0
        self.fail_insert = False
        self.fail_append = False

    async def ensure_indexes(self) -> None:
        pass

    async def list_summaries(self) -> list[dict[str, Any]]:
        return [
            {
                "_id": document["_id"],
                "title": document["title"],
                "concepts": [{"id": entry["id"]} for entry in document["concepts"]],
                "created_at": document["created_at"],
            }
            for document in self.graphs.values()
        ]

    async def get(self, graph_id: str) -> dict[str, Any] | None:
        document = self.graphs.get(graph_id)
        return copy.deepcopy(document) if document else None

    async def insert(
        self,
        *,
        title: str,
        concepts: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if self.fail_insert:
            raise PyMongoError("scripted insert failure")
        self._counter += 1
        graph_id = f"fake-graph-{self._counter}"
        document: dict[str, Any] = {
            "_id": graph_id,
            "title": title,
            "version": 1,
            "concepts": copy.deepcopy(concepts),
            "edges": copy.deepcopy(edges),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        self.graphs[graph_id] = document
        return copy.deepcopy(document)

    async def append(
        self,
        graph_id: str,
        *,
        expected_version: int,
        new_concepts: list[dict[str, Any]],
        new_edges: list[dict[str, Any]],
    ) -> bool:
        if self.fail_append:
            raise PyMongoError("scripted append failure")
        document = self.graphs.get(graph_id)
        if document is None or document["version"] != expected_version:
            return False
        document["concepts"].extend(copy.deepcopy(new_concepts))
        document["edges"].extend(copy.deepcopy(new_edges))
        document["version"] += 1
        return True

    async def delete(self, graph_id: str) -> bool:
        return self.graphs.pop(graph_id, None) is not None

    async def set_concept_rubric(
        self, graph_id: str, concept_id: str, rubric: dict[str, Any]
    ) -> bool:
        document = self.graphs.get(graph_id)
        if document is None:
            return False
        for entry in document["concepts"]:
            if entry["id"] == concept_id and entry.get("rubric") is None:
                entry["rubric"] = copy.deepcopy(rubric)
                return True
        return False


def make_generated_rubric(concept_id: str) -> Rubric:
    """A deterministic, fully valid rubric for any generated concept."""
    return Rubric.model_validate(
        {
            "concept_id": concept_id,
            "points": [
                {
                    "id": f"{concept_id}-p{index}",
                    "label": f"Point {index} of {concept_id}",
                    "description": f"Evidence criterion {index}.",
                }
                for index in range(1, 5)
            ],
            "misconceptions": [
                {
                    "id": f"{concept_id}-mc{index}",
                    "summary": f"Mix-up {index} about {concept_id}.",
                    "belief": "I believe the wrong thing.",
                    "why_plausible": "It feels intuitive.",
                    "fallback_line": "But wait, is that not how it works?",
                    "correction": "State the correct mechanism explicitly.",
                }
                for index in range(1, 3)
            ],
            "probes": {
                "beginner": ["What does this mean?"],
                "confident": ["Surely it works like X, right?"],
                "skeptic": ["Why would that hold in the edge case?"],
            },
        }
    )


class FakeRubricGenerator:
    def __init__(self, call_log: list[str]) -> None:
        self.call_log = call_log
        self.calls: list[dict[str, Any]] = []
        self.fail = False

    async def generate(self, *, topic_title: str, concept_id: str) -> Rubric:
        self.call_log.append("rubric_generator")
        self.calls.append({"topic_title": topic_title, "concept_id": concept_id})
        if self.fail:
            raise GenerationError("scripted rubric generation failure")
        return make_generated_rubric(concept_id)


class FakeGraphSummarizer:
    def __init__(self, call_log: list[str]) -> None:
        self.call_log = call_log
        self.calls: list[dict[str, Any]] = []
        self.responses: list[GraphExtraction] = []
        self.fail = False

    def queue(self, *extractions: GraphExtraction) -> None:
        self.responses.extend(extractions)

    async def extract(self, *, transcript, taught_concept, existing) -> GraphExtraction:
        self.call_log.append("graph_summarizer")
        self.calls.append(
            {
                "transcript": list(transcript),
                "taught_concept": taught_concept,
                "existing": existing,
            }
        )
        if self.fail:
            raise GenerationError("scripted extraction failure")
        if self.responses:
            return self.responses.pop(0)
        return GraphExtraction()


class FakeSpeechService:
    TRANSCRIPT = "Gradient descent steps opposite the gradient."
    AUDIO = b"ID3\x04fake-mp3-bytes"

    def __init__(self) -> None:
        self.fail_transcribe = False
        self.fail_synthesize = False
        self.synthesized_texts: list[str] = []
        self.synthesized_modes: list[str | None] = []

    async def transcribe(self, audio: bytes) -> str:
        if self.fail_transcribe:
            raise TranscriptionError("scripted transcription failure")
        return self.TRANSCRIPT

    async def synthesize(self, text: str, mode: str | None = None) -> bytes:
        if self.fail_synthesize:
            raise SpeechSynthesisError("scripted synthesis failure")
        self.synthesized_texts.append(text)
        self.synthesized_modes.append(mode)
        return self.AUDIO
