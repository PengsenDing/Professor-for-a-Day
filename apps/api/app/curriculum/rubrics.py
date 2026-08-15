"""Concept Rubrics: pre-authored, version-controlled Judge material (AC-RUB).

One JSON file per concept under `rubrics/`. Rubric internals (`description`,
`correction`, probe text) are used only in prompts and never reach a client
response (AC-RUB-6).
"""

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

from ..schemas import Mode
from . import load_catalog

_RUBRICS_DIR = Path(__file__).parent / "rubrics"


class RubricPoint(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1, description="Learner-safe; shown once confirmed.")
    description: str = Field(min_length=1, description="Internal; Judge prompts only.")


class RubricMisconception(BaseModel):
    id: str = Field(min_length=1)
    summary: str = Field(min_length=1, description="Learner-safe statement of the mix-up.")
    belief: str = Field(
        min_length=1,
        description="Internal; the wrong belief in the student's own voice, for posing.",
    )
    why_plausible: str = Field(
        min_length=1,
        description="Internal; why the belief feels convincing, so phrasing stays believable.",
    )
    fallback_line: str = Field(
        min_length=1,
        description="Pre-authored in-character utterance used when generation fails.",
    )
    correction: str = Field(min_length=1, description="Internal; what the Judge listens for.")


class Rubric(BaseModel):
    concept_id: str
    points: list[RubricPoint] = Field(min_length=3, max_length=5)
    misconceptions: list[RubricMisconception] = Field(min_length=2)
    probes: dict[Mode, list[str]] = Field(
        description="Mode-specific probe suggestions fed to the AI Student."
    )

    def point_ids(self) -> set[str]:
        return {point.id for point in self.points}

    def misconception_ids(self) -> set[str]:
        return {misconception.id for misconception in self.misconceptions}


@lru_cache
def load_rubrics() -> dict[str, Rubric]:
    """Load every rubric, failing loudly on gaps or duplicates (AC-RUB-1)."""
    rubrics: dict[str, Rubric] = {}
    for path in sorted(_RUBRICS_DIR.glob("*.json")):
        rubric = Rubric.model_validate_json(path.read_text(encoding="utf-8"))
        if rubric.concept_id != path.stem:
            raise ValueError(f"{path.name} declares concept_id {rubric.concept_id!r}")
        _check_rubric(rubric)
        rubrics[rubric.concept_id] = rubric

    catalog_ids = {concept.id for concept in load_catalog().concepts}
    missing = catalog_ids - rubrics.keys()
    if missing:
        raise ValueError(f"Concepts without a rubric: {sorted(missing)}")
    extra = rubrics.keys() - catalog_ids
    if extra:
        raise ValueError(f"Rubrics for unknown concepts: {sorted(extra)}")
    return rubrics


def _check_rubric(rubric: Rubric) -> None:
    if len(rubric.point_ids()) != len(rubric.points):
        raise ValueError(f"Duplicate point ids in rubric {rubric.concept_id!r}")
    if len(rubric.misconception_ids()) != len(rubric.misconceptions):
        raise ValueError(f"Duplicate misconception ids in rubric {rubric.concept_id!r}")
    for mode in Mode:
        if not rubric.probes.get(mode):
            raise ValueError(f"Rubric {rubric.concept_id!r} lacks probes for mode {mode.value!r}")
