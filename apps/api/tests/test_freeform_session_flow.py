"""Freeform (topic) sessions: generated rubric at start, graph creation at end
(ADR-0004)."""

from uuid import uuid4

from app.services.graph_summarizer import GraphExtraction, ProposedConcept, ProposedEdge
from tests.fakes import make_evaluation, make_generated_rubric

TOPIC = "How compilers work"
SLUG = "how-compilers-work"


def start_topic(harness, topic: str = TOPIC, mode: str = "beginner") -> dict:
    response = harness.client.post("/api/sessions", json={"topic": topic, "mode": mode})
    assert response.status_code == 201, response.text
    return response.json()


def submit(harness, session_id: str, text: str = "An explanation.", turn_id: str | None = None):
    return harness.client.post(
        f"/api/sessions/{session_id}/turns",
        json={
            "learner_text": text,
            "input_mode": "text",
            "client_turn_id": turn_id or str(uuid4()),
        },
    )


def queue_mastery(harness, slug: str = SLUG) -> None:
    """Two turns to 100%: confirm three points, then the last one plus the repair."""
    rubric = make_generated_rubric(slug)
    point_ids = [point.id for point in rubric.points]
    harness.judge.queue(make_evaluation(points=point_ids[:3]))
    harness.judge.queue(
        make_evaluation(points=point_ids[3:], corrected=[rubric.misconceptions[0].id])
    )


COMPILER_EXTRACTION = GraphExtraction(
    graph_title="Compilers",
    concepts=[
        ProposedConcept(id=SLUG, title=TOPIC, summary="dup of the taught node"),
        ProposedConcept(id="lexing", title="Lexing", summary="Tokenize source."),
        ProposedConcept(title="Parsing", summary="Build the tree."),
    ],
    edges=[
        ProposedEdge(from_concept="lexing", to_concept="parsing"),
        ProposedEdge(from_concept="parsing", to_concept=SLUG),
    ],
)


# -- start ----------------------------------------------------------------------


def test_topic_start_generates_a_rubric_and_has_no_graph(harness) -> None:
    body = start_topic(harness)

    assert body["graph_id"] is None
    assert body["concept"] == {"id": SLUG, "title": TOPIC}
    assert body["progress"] == {"percent": 0}
    assert harness.rubric_generator.calls == [
        {"topic_title": TOPIC, "concept_id": SLUG}
    ]
    # Rubric generation runs before the opening question.
    assert harness.call_log.index("rubric_generator") < harness.call_log.index(
        "student_opening"
    )
    stored = harness.repository.sessions[body["session_id"]]
    assert stored["topic"] == TOPIC
    assert stored["rubric"]["concept_id"] == SLUG


def test_rubric_generation_failure_leaves_no_session(harness) -> None:
    harness.rubric_generator.fail = True

    response = harness.client.post(
        "/api/sessions", json={"topic": TOPIC, "mode": "beginner"}
    )

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "GENERATION_FAILED"
    assert harness.repository.sessions == {}
    assert "student_opening" not in harness.call_log


def test_topic_plus_concept_is_a_validation_failure(harness) -> None:
    response = harness.client.post(
        "/api/sessions",
        json={
            "topic": TOPIC,
            "graph_id": "machine-learning",
            "concept_id": "gradient-descent",
            "mode": "beginner",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


# -- session end creates the graph ------------------------------------------------


def test_mastery_creates_a_graph_from_the_conversation(harness) -> None:
    session = start_topic(harness)
    queue_mastery(harness)
    harness.summarizer.queue(COMPILER_EXTRACTION)

    submit(harness, session["session_id"])
    final = submit(harness, session["session_id"]).json()

    assert final["status"] == "ended"
    assert final["end_reason"] == "mastery"
    update = final["graph_update"]
    assert update["created"] is True
    assert update["graph_title"] == "Compilers"
    assert [concept["id"] for concept in update["added_concepts"]] == [
        SLUG,
        "lexing",
        "parsing",
    ]

    graph = harness.graph_repository.graphs[update["graph_id"]]
    entries = {entry["id"]: entry for entry in graph["concepts"]}
    # The taught concept carries its generated rubric into the graph; the
    # proposed neighbors wait for on-demand generation.
    assert entries[SLUG]["rubric"]["concept_id"] == SLUG
    assert entries["lexing"]["rubric"] is None
    assert graph["edges"] == [
        {"from": "lexing", "to": "parsing"},
        {"from": "parsing", "to": SLUG},
    ]

    # The session now belongs to its graph.
    stored = harness.repository.sessions[session["session_id"]]
    assert stored["graph_id"] == update["graph_id"]


def test_turn_limit_creates_a_graph_too(harness) -> None:
    session = start_topic(harness)
    harness.summarizer.queue(COMPILER_EXTRACTION)

    final = None
    for _ in range(8):
        final = submit(harness, session["session_id"]).json()

    assert final["status"] == "ended"
    assert final["end_reason"] == "turn_limit"
    assert final["graph_update"]["created"] is True


def test_finish_creates_a_graph_too(harness) -> None:
    session = start_topic(harness)
    harness.summarizer.queue(COMPILER_EXTRACTION)

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    assert finished["end_reason"] == "learner_finished"
    assert finished["graph_update"]["created"] is True
    # The freeform report recommends nothing: its graph did not exist when the
    # report was built.
    assert finished["report"]["recommended_next_concept"] is None


# -- degradation -------------------------------------------------------------------


def test_summarizer_failure_degrades_to_a_single_concept_graph(harness) -> None:
    session = start_topic(harness)
    harness.summarizer.fail = True

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    update = finished["graph_update"]
    assert update["created"] is True
    assert [concept["id"] for concept in update["added_concepts"]] == [SLUG]
    graph = harness.graph_repository.graphs[update["graph_id"]]
    assert graph["edges"] == []
    assert graph["concepts"][0]["rubric"]["concept_id"] == SLUG


def test_graph_insert_failure_never_blocks_the_report(harness) -> None:
    session = start_topic(harness)
    harness.graph_repository.fail_insert = True

    finished = harness.client.post(
        f"/api/sessions/{session['session_id']}/finish"
    ).json()

    assert finished["graph_update"] is None
    assert finished["report"]["improvement_suggestion"]
    stored = harness.repository.sessions[session["session_id"]]
    assert stored["status"] == "ended"
    assert stored["graph_id"] is None


# -- idempotency --------------------------------------------------------------------


def test_ending_turn_retry_replays_graph_update_without_resummarizing(harness) -> None:
    session = start_topic(harness)
    queue_mastery(harness)
    harness.summarizer.queue(COMPILER_EXTRACTION)

    submit(harness, session["session_id"])
    turn_id = str(uuid4())
    first = submit(harness, session["session_id"], turn_id=turn_id).json()
    summarizer_calls = len(harness.summarizer.calls)

    retry = submit(harness, session["session_id"], turn_id=turn_id).json()

    assert retry == first
    assert len(harness.summarizer.calls) == summarizer_calls  # no second extraction
    assert len(harness.graph_repository.graphs) == 1  # no second graph


def test_finish_after_ended_replays_the_stored_graph_update(harness) -> None:
    session = start_topic(harness)
    harness.summarizer.queue(COMPILER_EXTRACTION)

    first = harness.client.post(f"/api/sessions/{session['session_id']}/finish").json()
    second = harness.client.post(f"/api/sessions/{session['session_id']}/finish").json()

    assert second["graph_update"] == first["graph_update"]
    assert len(harness.summarizer.calls) == 1
