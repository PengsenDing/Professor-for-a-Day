"""Teaching Session contract schemas: lifecycle, turn envelope, Teacher Report."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from .curriculum import ConceptId, ConceptRef
from .graphs import GraphId, GraphUpdate

Percent = Annotated[int, Field(ge=0, le=100)]


class Mode(StrEnum):
    beginner = "beginner"
    confident = "confident"
    skeptic = "skeptic"


class InputMode(StrEnum):
    text = "text"
    voice = "voice"


class SessionStatus(StrEnum):
    active = "active"
    ended = "ended"


class EndReason(StrEnum):
    mastery = "mastery"
    learner_finished = "learner_finished"
    # Legacy: sessions no longer have a turn budget, but sessions stored before
    # the limit was removed still carry this end reason.
    turn_limit = "turn_limit"


class Progress(BaseModel):
    percent: Percent = Field(
        description=(
            "Session Progress derived from confirmed rubric coverage. Monotonic "
            "within a session. Capped at 99 while no misconception challenge has "
            "been posed or any posed challenge is unresolved."
        )
    )


class StartSessionRequest(BaseModel):
    """Exactly one of (`graph_id` + `concept_id`) or `topic` must be provided."""

    graph_id: GraphId | None = Field(
        default=None,
        description="Required together with `concept_id`; omit for `topic` sessions.",
    )
    concept_id: ConceptId | None = None
    topic: (
        Annotated[str, StringConstraints(min_length=1, max_length=200)] | None
    ) = Field(
        default=None,
        description=(
            "Free-text subject to teach. The backend generates a rubric for it "
            "and, at session end, summarizes the conversation into a new "
            "knowledge graph."
        ),
    )
    mode: Mode

    @model_validator(mode="after")
    def _exactly_one_shape(self) -> "StartSessionRequest":
        concept_shape = self.graph_id is not None and self.concept_id is not None
        topic_shape = self.topic is not None and self.topic.strip() != ""
        if topic_shape and (self.graph_id is not None or self.concept_id is not None):
            raise ValueError("Provide either graph_id + concept_id or topic, not both")
        if not topic_shape and not concept_shape:
            raise ValueError("Provide graph_id + concept_id, or a non-empty topic")
        return self


class SessionCreated(BaseModel):
    session_id: str
    graph_id: GraphId | None = Field(
        description="Null for a `topic` session until its graph is created at session end."
    )
    concept: ConceptRef
    mode: Mode
    student_text: str = Field(
        min_length=1,
        description="The AI Student's opening question. Fetch its audio at turn_number 0.",
    )
    progress: Progress
    learner_turn_count: Literal[0]
    status: Literal["active"]
    active_misconception: None


class SubmitTurnRequest(BaseModel):
    learner_text: str = Field(
        min_length=1,
        max_length=8000,
        description=(
            "The learner's explanation. For voice turns this is the transcript "
            "returned by the transcription endpoint."
        ),
    )
    input_mode: InputMode
    client_turn_id: UUID = Field(
        description="Client-generated idempotency key. Retries MUST reuse the same value."
    )

    @field_validator("learner_text")
    @classmethod
    def _reject_whitespace_only(cls, value: str) -> str:
        # AC-TRN-5: whitespace-only submissions are rejected at the boundary.
        if not value.strip():
            raise ValueError("learner_text must not be empty or whitespace-only")
        return value


class RubricPointRef(BaseModel):
    id: str = Field(description="Stable rubric point id (e.g. `gd-2`).")
    label: str = Field(
        description="Learner-safe label. Internal rubric descriptions never appear."
    )


class ActiveMisconception(BaseModel):
    id: str
    summary: str = Field(
        description=(
            "Learner-safe statement of the misunderstanding being repaired. "
            "Never reveals the rubric's correction."
        )
    )


class DemonstratedEvidence(BaseModel):
    """Why one rubric point was scored: the learner's own words, or nothing.

    `quote` is surfaced only when the Judge's recorded evidence is a verbatim
    substring of that turn's submission — never Judge or rubric text.
    """

    point: RubricPointRef
    quote: str | None = Field(
        description=(
            "The learner's own words that demonstrated the point; null when the "
            "Judge's evidence was not a verbatim quote."
        )
    )
    turn_number: Annotated[int, Field(ge=1)] = Field(
        description="The learner turn in which the point was demonstrated."
    )


class TeacherReport(BaseModel):
    final_percent: Percent = Field(
        description="Equals the session's final computed progress; never recomputed."
    )
    explained_well: list[str] = Field(
        description="Grounded in this session's Judge evaluations only. May be empty."
    )
    evidence: list[DemonstratedEvidence] = Field(
        default_factory=list,
        description=(
            "One entry per confirmed rubric point, in rubric order. Defaults to "
            "empty so reports stored before this field existed stay valid."
        ),
    )
    misconceptions_corrected: list[str]
    gaps_and_accidental_implications: list[str]
    improvement_suggestion: str = Field(
        min_length=1,
        description="Exactly one concrete, actionable suggestion. Always present, even at 0%.",
    )
    recommended_next_concept: ConceptRef | None = Field(
        description="Null when the graph has no other concept to recommend."
    )
    mastery_achieved: bool = Field(
        description=(
            "True if and only if final_percent is 100. Drives the accomplishment "
            "animation client-side."
        )
    )


class TurnEnvelope(BaseModel):
    turn_number: Annotated[int, Field(ge=1)]
    learner_transcript: str = Field(
        description="The learner text that was judged (echo of the submission)."
    )
    student_text: str = Field(
        min_length=1,
        description=(
            "The AI Student's follow-up question or plausible misunderstanding. "
            "Fetch its audio at this turn_number."
        ),
    )
    progress: Progress
    newly_covered_points: list[RubricPointRef] = Field(
        description="Rubric points confirmed on this turn only."
    )
    active_misconception: ActiveMisconception | None
    learner_turn_count: Annotated[int, Field(ge=1)]
    status: SessionStatus
    end_reason: EndReason | None = Field(
        description="Null while active. `mastery` when this turn ended the session."
    )
    report: TeacherReport | None = Field(
        description=(
            "Null while active; fully populated in the same envelope when the session ends."
        )
    )
    graph_update: GraphUpdate | None = Field(
        description=(
            "Null while active, for builtin-graph sessions, and when graph "
            "persistence failed. Populated on the ending turn of `topic` and "
            "user-graph sessions. Idempotent retries replay the stored value."
        )
    )


class SessionFinished(BaseModel):
    session_id: str
    status: Literal["ended"]
    end_reason: EndReason
    progress: Progress
    report: TeacherReport
    graph_update: GraphUpdate | None = Field(
        description="Same semantics as on `TurnEnvelope`."
    )


class SnapshotTurn(BaseModel):
    turn_number: Annotated[int, Field(ge=1)]
    learner_transcript: str = Field(description="The learner text that was judged.")
    input_mode: InputMode
    student_text: str = Field(
        min_length=1,
        description="The AI Student's reply. Fetch its audio at this turn_number.",
    )
    newly_covered_points: list[RubricPointRef] = Field(
        description=(
            "Rubric points confirmed on this turn only. Cumulative coverage is "
            "derivable client-side."
        )
    )


class SessionSnapshot(BaseModel):
    """Learner-safe read model of a stored session (AC-SES-7 / AC-SES-10, ADR-0004).

    Judge evaluations, rubric internals, and probe recommendations never appear.
    """

    session_id: str
    graph_id: GraphId | None = Field(
        description=(
            "The session's knowledge graph; null for a `topic` session whose "
            "graph does not exist yet."
        )
    )
    concept: ConceptRef
    mode: Mode
    opening_text: str = Field(
        min_length=1,
        description="The AI Student's opening question. Fetch its audio at turn_number 0.",
    )
    turns: list[SnapshotTurn] = Field(
        description="Every accepted learner turn in order. Judge evaluations never appear."
    )
    progress: Progress
    active_misconception: ActiveMisconception | None
    learner_turn_count: Annotated[int, Field(ge=0)]
    status: SessionStatus
    end_reason: EndReason | None = Field(description="Null while active.")
    report: TeacherReport | None = Field(
        description="Null while active; the stored Teacher Report once ended."
    )
    graph_update: GraphUpdate | None = Field(
        description="Same semantics as on `TurnEnvelope`; replayed from storage."
    )
    created_at: datetime = Field(description="When the session was started.")
