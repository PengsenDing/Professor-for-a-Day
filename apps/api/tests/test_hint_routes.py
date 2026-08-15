"""Per-turn hint endpoint: learner-safe, generated once, never touches session state."""

from uuid import uuid4

from tests.fakes import make_evaluation

GD = "gradient-descent"
ML = "machine-learning"


def start(harness) -> dict:
    return harness.client.post(
        "/api/sessions", json={"graph_id": ML, "concept_id": GD, "mode": "confident"}
    ).json()


def submit(harness, session_id: str, text: str = "It steps along the gradient.") -> dict:
    response = harness.client.post(
        f"/api/sessions/{session_id}/turns",
        json={"learner_text": text, "input_mode": "text", "client_turn_id": str(uuid4())},
    )
    assert response.status_code == 200
    return response.json()


def test_turn_zero_hint_targets_the_opening_question(harness) -> None:
    session = start(harness)

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")

    assert response.status_code == 200
    assert response.json() == {"turn_number": 0, "hint": harness.hint.HINT}
    call = harness.hint.calls[0]
    assert call["student_text"] == session["student_text"]
    assert call["transcript"] == []
    assert call["misconception_summary"] is None


def test_hint_is_generated_once_and_replayed(harness) -> None:
    session = start(harness)

    first = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")
    second = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")

    assert first.json() == second.json()
    assert harness.call_log.count("hint") == 1  # the replay ran no provider call


def test_hint_for_a_learner_turn_sees_only_learner_visible_context(harness) -> None:
    """The adapter gets the conversation, the statement, and the learner-safe
    misconception summary — exactly what the learner can already see (AC-SEC-3)."""
    session = start(harness)
    harness.judge.queue(make_evaluation(suggested="gd-mc-1"))
    envelope = submit(harness, session["session_id"])

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/1/hint")

    assert response.status_code == 200
    call = harness.hint.calls[0]
    assert call["student_text"] == envelope["student_text"]
    assert call["transcript"] == [
        ("student", session["student_text"]),
        ("teacher", "It steps along the gradient."),
    ]
    active = envelope["active_misconception"]
    expected_summary = active["summary"] if active else None
    assert call["misconception_summary"] == expected_summary
    assert set(call) == {
        "concept_title",
        "mode",
        "transcript",
        "student_text",
        "misconception_summary",
    }


def test_hint_never_mutates_progress_or_the_turn_loop(harness) -> None:
    session = start(harness)

    harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")
    snapshot = harness.client.get(f"/api/sessions/{session['session_id']}").json()

    assert snapshot["progress"] == {"percent": 0}
    assert snapshot["learner_turn_count"] == 0
    assert snapshot["status"] == "active"
    assert "judge" not in harness.call_log
    assert "student_reply" not in harness.call_log


def test_hint_for_missing_turn_is_404(harness) -> None:
    session = start(harness)

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/3/hint")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TURN_NOT_FOUND"


def test_hint_for_unknown_session_is_404(harness) -> None:
    response = harness.client.get("/api/sessions/nope/turns/0/hint")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SESSION_NOT_FOUND"


def test_hint_generation_failure_is_502_and_non_fatal(harness) -> None:
    session = start(harness)
    harness.hint.fail = True

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "GENERATION_FAILED"

    # The session is untouched, and a later fetch regenerates (no failed cache).
    submit(harness, session["session_id"], text="still teaching")
    harness.hint.fail = False
    retry = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")
    assert retry.status_code == 200
    assert retry.json()["hint"] == harness.hint.HINT


def test_hint_works_on_an_ended_session(harness) -> None:
    session = start(harness)
    assert harness.client.post(f"/api/sessions/{session['session_id']}/finish").status_code == 200

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/hint")

    assert response.status_code == 200
    assert response.json()["hint"] == harness.hint.HINT
