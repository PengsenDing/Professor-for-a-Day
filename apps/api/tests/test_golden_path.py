"""§6 — the Gradient Descent backend golden path, end to end with fakes.

Also covers T17 (evaluation stored with its turn) and T18 (no audio, no secrets,
no rubric internals in stored documents or responses).
"""

import json
from uuid import uuid4

from app.config import get_settings
from app.curriculum.rubrics import load_rubrics
from tests.fakes import make_evaluation

GD = "gradient-descent"
ML = "machine-learning"


def test_gradient_descent_golden_path(harness) -> None:
    rubric = load_rubrics()[GD]
    client = harness.client
    collected_responses: list[str] = []

    # 1. The graph list carries the builtin graph, whose curriculum contains
    #    gradient-descent with prerequisite edges.
    graphs = client.get("/api/graphs")
    collected_responses.append(graphs.text)
    assert graphs.json()["graphs"][0]["id"] == ML

    curriculum = client.get(f"/api/graphs/{ML}/curriculum")
    collected_responses.append(curriculum.text)
    concepts = {concept["id"] for concept in curriculum.json()["concepts"]}
    assert GD in concepts
    assert any(GD in (edge["from"], edge["to"]) for edge in curriculum.json()["edges"])

    # 2. Start a confident-mode session at 0%.
    started = client.post(
        "/api/sessions", json={"graph_id": ML, "concept_id": GD, "mode": "confident"}
    )
    collected_responses.append(started.text)
    assert started.status_code == 201
    session = started.json()
    assert session["student_text"]
    assert session["progress"]["percent"] == 0
    assert session["graph_id"] == ML
    session_id = session["session_id"]

    # 3. Transcribe a fake audio blob.
    transcribed = client.post(
        "/api/speech/transcriptions",
        files={"audio": ("take.webm", b"fake-audio-bytes", "audio/webm")},
    )
    collected_responses.append(transcribed.text)
    assert transcribed.status_code == 200
    transcript = transcribed.json()["transcript"]

    # 4. Submit the transcript as a voice turn: progress rises, a misconception activates.
    harness.judge.queue(
        make_evaluation(points=[rubric.points[0].id, rubric.points[1].id])
    )
    turn_id = str(uuid4())
    first = client.post(
        f"/api/sessions/{session_id}/turns",
        json={"learner_text": transcript, "input_mode": "voice", "client_turn_id": turn_id},
    )
    collected_responses.append(first.text)
    assert first.status_code == 200
    first_envelope = first.json()
    assert first_envelope["progress"]["percent"] > 0
    assert first_envelope["active_misconception"] is not None
    assert first_envelope["learner_turn_count"] == 1

    # 5. Retry the same client_turn_id: identical envelope, still one persisted turn.
    retry = client.post(
        f"/api/sessions/{session_id}/turns",
        json={"learner_text": transcript, "input_mode": "voice", "client_turn_id": turn_id},
    )
    assert retry.json() == first_envelope
    assert len(harness.repository.sessions[session_id]["turns"]) == 1

    # 6. Cover the rest and resolve the misconception within eight turns.
    posed_id = first_envelope["active_misconception"]["id"]
    remaining = [point.id for point in rubric.points[2:]]
    harness.judge.queue(make_evaluation(points=remaining, corrected=[posed_id]))
    final = client.post(
        f"/api/sessions/{session_id}/turns",
        json={
            "learner_text": "It steps against the gradient, and it can hit local minima.",
            "input_mode": "text",
            "client_turn_id": str(uuid4()),
        },
    )
    collected_responses.append(final.text)
    final_envelope = final.json()
    assert final_envelope["progress"]["percent"] == 100
    assert final_envelope["status"] == "ended"
    assert final_envelope["end_reason"] == "mastery"
    assert final_envelope["report"]["mastery_achieved"] is True
    # Builtin-graph sessions never summarize or mutate the graph (ADR-0002).
    assert final_envelope["graph_update"] is None
    assert "graph_summarizer" not in harness.call_log

    # 7. Read the session back: ordered turns, per-turn evaluations, monotonic
    #    progress, stored report, and no audio anywhere (T17/T18).
    stored = harness.repository.sessions[session_id]
    turn_numbers = [turn["turn_number"] for turn in stored["turns"]]
    assert turn_numbers == sorted(turn_numbers)
    progresses = [turn["progress_percent"] for turn in stored["turns"]]
    assert progresses == sorted(progresses)
    for turn in stored["turns"]:
        assert turn["evaluation"]["newly_demonstrated_points"] is not None
    rising_turn = stored["turns"][0]
    assert rising_turn["evaluation"]["newly_demonstrated_points"]  # T17 / AC-PER-4
    assert stored["report"]["mastery_achieved"] is True
    assert stored["status"] == "ended"

    serialized_document = json.dumps(stored, default=str)
    assert "audio" not in serialized_document.lower()  # AC-STT-5 / AC-TTS-5
    _assert_no_secrets_or_rubric_internals(serialized_document, rubric)

    for response_text in collected_responses:  # AC-SEC-1/3
        _assert_no_secrets_or_rubric_internals(response_text, rubric)


def _assert_no_secrets_or_rubric_internals(serialized: str, rubric) -> None:
    settings = get_settings()
    assert settings.deutschlandgpt_api_key.get_secret_value() not in serialized
    assert settings.elevenlabs_api_key.get_secret_value() not in serialized
    for point in rubric.points:
        assert point.description not in serialized
    for misconception in rubric.misconceptions:
        assert misconception.correction not in serialized
