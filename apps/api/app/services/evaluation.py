"""The Judge's structured output contract (AC-JDG-1).

Pure pydantic models: importable by the scoring engine and tests without
touching LangChain, HTTP, or Mongo.
"""

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

# Live providers occasionally rename id fields (e.g. `point_id` -> `id`), so the
# models advertise the canonical name in their schema but accept the drift.


class DemonstratedPoint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    point_id: str = Field(validation_alias=AliasChoices("point_id", "id"))
    evidence: str = Field(description="A short learner quote demonstrating the point.")


class UnresolvedMisconception(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    misconception_id: str = Field(validation_alias=AliasChoices("misconception_id", "id"))
    summary: str


class IntroducedMisconception(BaseModel):
    summary: str


class JudgeEvaluation(BaseModel):
    newly_demonstrated_points: list[DemonstratedPoint]
    corrected_misconceptions: list[str]
    unresolved_misconceptions: list[UnresolvedMisconception]
    newly_introduced_misconceptions: list[IntroducedMisconception]
    recommended_next_probe: str
