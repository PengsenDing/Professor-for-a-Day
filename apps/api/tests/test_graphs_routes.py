"""T1 — graph routes: builtin listing, curricula without provider calls,
no rubric leakage, no per-learner state (AC-CAT-1…8 extended by ADR-0004)."""

from app.curriculum.rubrics import load_rubrics
from tests.fakes import make_generated_rubric

ML = "machine-learning"


def _user_graph(harness) -> str:
    """Seed one user graph (with a cached rubric) straight into the fake repo."""
    document = {
        "_id": "fake-graph-seeded",
        "title": "Compilers",
        "version": 1,
        "concepts": [
            {
                "id": "compilers",
                "title": "Compilers",
                "summary": "Translate source to machine code.",
                "rubric": make_generated_rubric("compilers").model_dump(),
            },
            {"id": "lexing", "title": "Lexing", "summary": "Tokenize source.", "rubric": None},
        ],
        "edges": [{"from": "lexing", "to": "compilers"}],
        "created_at": None,
        "updated_at": None,
    }
    harness.graph_repository.graphs[document["_id"]] = document
    return document["_id"]


def test_graph_list_has_builtin_first_without_provider_calls(harness) -> None:
    graph_id = _user_graph(harness)

    response = harness.client.get("/api/graphs")

    assert response.status_code == 200
    graphs = response.json()["graphs"]
    assert harness.call_log == []  # AC-CAT-1: zero provider calls
    assert graphs[0] == {
        "id": ML,
        "title": "Machine Learning",
        "source": "builtin",
        "concept_count": 15,
        "created_at": None,
    }
    assert graphs[1]["id"] == graph_id
    assert graphs[1]["source"] == "user"
    assert graphs[1]["concept_count"] == 2


def test_builtin_curriculum_is_the_catalog(harness) -> None:
    response = harness.client.get(f"/api/graphs/{ML}/curriculum")

    assert response.status_code == 200
    body = response.json()
    assert len(body["concepts"]) == 15
    assert harness.call_log == []

    concept_ids = {concept["id"] for concept in body["concepts"]}
    assert "gradient-descent" in concept_ids
    for edge in body["edges"]:
        assert edge["from"] in concept_ids
        assert edge["to"] in concept_ids

    for concept in body["concepts"]:
        assert set(concept) == {"id", "title", "summary"}  # AC-CAT-8: no learner state


def test_user_graph_curriculum_leaks_no_rubric(harness) -> None:
    graph_id = _user_graph(harness)

    response = harness.client.get(f"/api/graphs/{graph_id}/curriculum")

    assert response.status_code == 200
    body = response.json()
    assert [concept["id"] for concept in body["concepts"]] == ["compilers", "lexing"]
    for concept in body["concepts"]:
        assert set(concept) == {"id", "title", "summary"}
    assert "rubric" not in response.text
    assert "Evidence criterion" not in response.text  # generated rubric internals


def test_unknown_graph_is_404(harness) -> None:
    response = harness.client.get("/api/graphs/no-such-graph/curriculum")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GRAPH_NOT_FOUND"


def test_delete_removes_a_user_graph(harness) -> None:
    graph_id = _user_graph(harness)

    response = harness.client.delete(f"/api/graphs/{graph_id}")

    assert response.status_code == 204
    assert graph_id not in harness.graph_repository.graphs
    listed = harness.client.get("/api/graphs").json()["graphs"]
    assert [graph["id"] for graph in listed] == [ML]
    assert harness.client.get(f"/api/graphs/{graph_id}/curriculum").status_code == 404


def test_builtin_graph_is_never_deletable(harness) -> None:
    response = harness.client.delete(f"/api/graphs/{ML}")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "GRAPH_NOT_DELETABLE"
    # The builtin graph is still there, fully intact.
    listed = harness.client.get("/api/graphs").json()["graphs"]
    assert listed[0]["id"] == ML
    assert listed[0]["concept_count"] == 15


def test_delete_unknown_graph_is_404(harness) -> None:
    response = harness.client.delete("/api/graphs/no-such-graph")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GRAPH_NOT_FOUND"


def test_builtin_curriculum_leaks_no_rubric_content(harness) -> None:
    serialized = harness.client.get(f"/api/graphs/{ML}/curriculum").text

    for rubric in load_rubrics().values():
        for point in rubric.points:
            assert point.id not in serialized
            assert point.description not in serialized
        for misconception in rubric.misconceptions:
            assert misconception.correction not in serialized
