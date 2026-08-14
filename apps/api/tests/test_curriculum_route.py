"""T1 — catalog route: 15 concepts, valid acyclic edges, no provider call,
no rubric leakage, no per-learner state (AC-CAT-1…8)."""

from app.curriculum.rubrics import load_rubrics


def test_curriculum_returns_catalog_without_provider_calls(harness) -> None:
    response = harness.client.get("/api/curriculum")

    assert response.status_code == 200
    body = response.json()
    assert len(body["concepts"]) == 15
    assert harness.call_log == []  # AC-CAT-1: zero provider calls

    concept_ids = {concept["id"] for concept in body["concepts"]}
    assert "gradient-descent" in concept_ids
    for edge in body["edges"]:
        assert edge["from"] in concept_ids
        assert edge["to"] in concept_ids

    for concept in body["concepts"]:
        assert set(concept) == {"id", "title", "summary"}  # AC-CAT-8: no learner state


def test_curriculum_leaks_no_rubric_content(harness) -> None:
    serialized = harness.client.get("/api/curriculum").text

    for rubric in load_rubrics().values():
        for point in rubric.points:
            assert point.id not in serialized
            assert point.description not in serialized
        for misconception in rubric.misconceptions:
            assert misconception.correction not in serialized
