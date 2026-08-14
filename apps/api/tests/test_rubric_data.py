"""T2 — rubric data integrity across all 15 concepts (AC-RUB-1…5)."""

from app.curriculum import load_catalog
from app.curriculum.rubrics import load_rubrics
from app.schemas import Mode


def test_every_concept_has_a_valid_rubric() -> None:
    rubrics = load_rubrics()
    catalog_ids = {concept.id for concept in load_catalog().concepts}

    assert set(rubrics) == catalog_ids  # AC-RUB-1

    for rubric in rubrics.values():
        assert 3 <= len(rubric.points) <= 5  # AC-RUB-2
        assert len(rubric.point_ids()) == len(rubric.points)
        for point in rubric.points:
            assert point.id and point.label and point.description

        assert len(rubric.misconceptions) >= 2  # AC-RUB-3
        for misconception in rubric.misconceptions:
            assert misconception.id and misconception.summary and misconception.correction

        for mode in Mode:  # AC-RUB-4
            assert rubric.probes.get(mode)


def test_rubrics_are_stable_across_reloads() -> None:
    load_rubrics.cache_clear()
    first = {concept_id: rubric.point_ids() for concept_id, rubric in load_rubrics().items()}
    load_rubrics.cache_clear()
    second = {concept_id: rubric.point_ids() for concept_id, rubric in load_rubrics().items()}
    assert first == second  # AC-RUB-5
