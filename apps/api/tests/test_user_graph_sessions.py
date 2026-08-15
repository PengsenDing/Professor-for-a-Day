"""Sessions on user graphs: on-demand rubric caching and append-only growth
(ADR-0004)."""

from uuid import uuid4

from app.services.graph_summarizer import GraphExtraction, ProposedConcept, ProposedEdge
from tests.fakes import make_generated_rubric


def seed_graph(harness, *, with_rubric: bool = False) -> str:
    document = {
        "_id": "fake-graph-seeded",
        "title": "Compilers",
        "version": 1,
        "concepts": [
            {
                "id": "compilers",
                "title": "Compilers",
                "summary": "Translate source to machine code.",
                "rubric": (
                    make_generated_rubric("compilers").model_dump() if with_rubric else None
                ),
            },
        ],
        "edges": [],
        "created_at": None,
        "updated_at": None,
    }
    harness.graph_repository.graphs[document["_id"]] = document
    return document["_id"]


def start(harness, graph_id: str, concept_id: str = "compilers") -> dict:
    response = harness.client.post(
        "/api/sessions",
        json={"graph_id": graph_id, "concept_id": concept_id, "mode": "beginner"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def submit(harness, session_id: str, text: str = "An explanation.") -> dict:
    response = harness.client.post(
        f"/api/sessions/{session_id}/turns",
        json={"learner_text": text, "input_mode": "text", "client_turn_id": str(uuid4())},
    )
    assert response.status_code == 200, response.text
    return response.json()


# -- on-demand rubrics -------------------------------------------------------------


def test_first_session_generates_and_caches_the_rubric(harness) -> None:
    graph_id = seed_graph(harness)

    body = start(harness, graph_id)

    assert body["graph_id"] == graph_id
    assert len(harness.rubric_generator.calls) == 1
    cached = harness.graph_repository.graphs[graph_id]["concepts"][0]["rubric"]
    assert cached["concept_id"] == "compilers"

    # A second session reuses the cache: zero further generator calls.
    start(harness, graph_id)
    assert len(harness.rubric_generator.calls) == 1


def test_cached_rubric_means_no_generator_call(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)

    start(harness, graph_id)

    assert harness.rubric_generator.calls == []


def test_concept_of_another_graph_is_rejected(harness) -> None:
    graph_id = seed_graph(harness)

    response = harness.client.post(
        "/api/sessions",
        json={"graph_id": graph_id, "concept_id": "gradient-descent", "mode": "beginner"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_CONCEPT"


# -- growth ------------------------------------------------------------------------


def test_session_end_grows_the_graph_append_only(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)
    session = start(harness, graph_id)
    harness.summarizer.queue(
        GraphExtraction(
            concepts=[
                ProposedConcept(id="lexing", title="Lexing", summary="Tokenize source."),
                ProposedConcept(id="compilers", title="Compilers", summary="dup"),
            ],
            edges=[ProposedEdge(from_concept="lexing", to_concept="compilers")],
        )
    )

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    update = finished["graph_update"]
    assert update == {
        "graph_id": graph_id,
        "graph_title": "Compilers",
        "created": False,
        "added_concepts": [{"id": "lexing", "title": "Lexing"}],
    }
    graph = harness.graph_repository.graphs[graph_id]
    assert [entry["id"] for entry in graph["concepts"]] == ["compilers", "lexing"]
    assert graph["edges"] == [{"from": "lexing", "to": "compilers"}]
    assert graph["version"] == 2
    # The summarizer saw the existing graph, so it could propose only additions.
    assert harness.summarizer.calls[0]["existing"] is not None


def test_growth_with_nothing_new_is_a_successful_no_op(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)
    session = start(harness, graph_id)

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    update = finished["graph_update"]
    assert update["created"] is False
    assert update["added_concepts"] == []
    assert harness.graph_repository.graphs[graph_id]["version"] == 1  # no write


def test_growth_extraction_failure_leaves_the_graph_unchanged(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)
    session = start(harness, graph_id)
    harness.summarizer.fail = True

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    assert finished["graph_update"] is None
    assert finished["report"]["improvement_suggestion"]
    graph = harness.graph_repository.graphs[graph_id]
    assert len(graph["concepts"]) == 1
    assert graph["version"] == 1


def test_turn_after_graph_deletion_fails_cleanly(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)
    session = start(harness, graph_id)
    assert harness.client.delete(f"/api/graphs/{graph_id}").status_code == 204

    response = harness.client.post(
        f"/api/sessions/{session['session_id']}/turns",
        json={"learner_text": "Hello.", "input_mode": "text", "client_turn_id": str(uuid4())},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "GRAPH_NOT_FOUND"
    # Nothing was persisted: the session is orphaned but not corrupted.
    stored = harness.repository.sessions[session["session_id"]]
    assert stored["turns"] == []


# -- reports on small graphs ---------------------------------------------------------


def test_single_concept_graph_recommends_nothing(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)
    session = start(harness, graph_id)

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    assert finished["report"]["recommended_next_concept"] is None


def test_grown_graph_recommends_a_neighbor_next_time(harness) -> None:
    graph_id = seed_graph(harness, with_rubric=True)
    grown = harness.graph_repository.graphs[graph_id]
    grown["concepts"].append(
        {"id": "lexing", "title": "Lexing", "summary": "Tokenize.", "rubric": None}
    )
    grown["edges"].append({"from": "compilers", "to": "lexing"})

    session = start(harness, graph_id)
    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    assert finished["report"]["recommended_next_concept"] == {
        "id": "lexing",
        "title": "Lexing",
    }
