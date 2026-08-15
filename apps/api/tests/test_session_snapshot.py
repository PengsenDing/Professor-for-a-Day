"""Session snapshot acceptance tests (AC-SES-7 / AC-SES-10, ADR-0004).

`GET /api/sessions/{session_id}` returns a learner-safe read model of a stored
session without invoking any provider. Judge evaluations and rubric internals
must never appear in the response.
"""

from tests.test_session_flow import GD, gd_rubric, start, submit

# Persisted turn fields that must never cross the API boundary.
JUDGE_INTERNAL_MARKERS = (
    "evaluation",
    "recommended_next_probe",
    "most_likely_misconception_id",
    "misconception_trigger_quote",
    "newly_demonstrated_points",
    "client_turn_id",
)


def snapshot(harness, session_id: str):
    return harness.client.get(f"/api/sessions/{session_id}")


def test_active_snapshot_matches_the_last_envelope_without_provider_calls(harness) -> None:
    from tests.fakes import make_evaluation

    session = start(harness, mode="skeptic")
    harness.judge.queue(make_evaluation(points=[gd_rubric().points[0].id]))
    envelope = submit(harness, session["session_id"], text="The gradient points uphill.").json()
    calls_before = len(harness.call_log)

    response = snapshot(harness, session["session_id"])

    assert response.status_code == 200, response.text
    assert len(harness.call_log) == calls_before  # AC-SES-10: no provider call
    body = response.json()
    assert body["session_id"] == session["session_id"]
    assert body["concept"] == {"id": GD, "title": "Gradient Descent"}
    assert body["mode"] == "skeptic"
    assert body["opening_text"] == session["student_text"]
    assert body["progress"] == envelope["progress"]
    assert body["active_misconception"] == envelope["active_misconception"]
    assert body["learner_turn_count"] == envelope["learner_turn_count"]
    assert body["status"] == "active"
    assert body["end_reason"] is None
    assert body["report"] is None
    assert body["created_at"]

    assert len(body["turns"]) == 1
    turn = body["turns"][0]
    assert turn["turn_number"] == 1
    assert turn["learner_transcript"] == "The gradient points uphill."
    assert turn["input_mode"] == "text"
    assert turn["student_text"] == envelope["student_text"]
    assert turn["newly_covered_points"] == envelope["newly_covered_points"]


def test_snapshot_preserves_voice_input_mode(harness) -> None:
    session = start(harness)
    response = harness.client.post(
        f"/api/sessions/{session['session_id']}/turns",
        json={
            "learner_text": "A spoken explanation.",
            "input_mode": "voice",
            "client_turn_id": "4f8b2c1e-9d3a-4e6b-8c7f-2a1d0e9b5c44",
        },
    )
    assert response.status_code == 200

    body = snapshot(harness, session["session_id"]).json()
    assert body["turns"][0]["input_mode"] == "voice"


def test_ended_snapshot_carries_the_stored_report(harness) -> None:
    session = start(harness)
    finished = harness.client.post(f"/api/sessions/{session['session_id']}/finish").json()

    body = snapshot(harness, session["session_id"]).json()

    assert body["status"] == "ended"
    assert body["end_reason"] == "learner_finished"
    assert body["report"] == finished["report"]
    assert body["progress"] == finished["progress"]


def test_unknown_session_is_404(harness) -> None:
    response = snapshot(harness, "no-such-session")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SESSION_NOT_FOUND"


def test_snapshot_never_leaks_judge_internals(harness) -> None:
    from tests.fakes import make_evaluation

    session = start(harness)
    harness.judge.queue(
        make_evaluation(
            points=[gd_rubric().points[0].id],
            suggested=gd_rubric().misconceptions[0].id,
            trigger="uphill",
        )
    )
    submit(harness, session["session_id"], text="Loss goes uphill along the gradient.")

    # The persisted turn embeds the full Judge evaluation; the snapshot must not.
    stored_turn = harness.repository.sessions[session["session_id"]]["turns"][0]
    assert "evaluation" in stored_turn

    response = snapshot(harness, session["session_id"])
    body = response.json()
    for turn in body["turns"]:
        for marker in JUDGE_INTERNAL_MARKERS:
            assert marker not in turn, marker
    assert "evidence" not in response.text
    assert "recommended_next_probe" not in response.text
