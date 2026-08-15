"""T15 + AC-STT/AC-TTS: transcription boundary checks and synthesize-on-fetch."""

from uuid import uuid4

GD = "gradient-descent"
ML = "machine-learning"


def start(harness) -> dict:
    return harness.client.post(
        "/api/sessions", json={"graph_id": ML, "concept_id": GD, "mode": "confident"}
    ).json()


def upload(harness, content_type: str = "audio/webm", data: bytes = b"fake-audio"):
    return harness.client.post(
        "/api/speech/transcriptions",
        files={"audio": ("take.webm", data, content_type)},
    )


# -- transcription ----------------------------------------------------------------


def test_transcription_returns_transcript_only(harness) -> None:
    response = upload(harness)

    assert response.status_code == 200
    assert response.json() == {"transcript": harness.speech.TRANSCRIPT}
    assert harness.call_log == []  # AC-STT-2: no Judge, no Student
    assert harness.repository.sessions == {}  # no session mutated


def test_unsupported_content_type_is_415_before_any_provider_call(harness) -> None:
    harness.speech.fail_transcribe = True  # would raise if reached

    response = upload(harness, content_type="application/pdf")

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_AUDIO_TYPE"  # AC-STT-3


def test_oversized_upload_is_413_before_any_provider_call(harness, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("TRANSCRIPTION_MAX_BYTES", "10")
    get_settings.cache_clear()
    try:
        harness.speech.fail_transcribe = True  # would raise if reached
        response = upload(harness, data=b"x" * 11)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "UPLOAD_TOO_LARGE"  # AC-STT-3


def test_transcription_failure_leaves_text_input_usable(harness) -> None:
    session = start(harness)
    harness.speech.fail_transcribe = True

    response = upload(harness)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "TRANSCRIPTION_FAILED"  # AC-STT-4

    turn = harness.client.post(
        f"/api/sessions/{session['session_id']}/turns",
        json={
            "learner_text": "typed instead",
            "input_mode": "text",
            "client_turn_id": str(uuid4()),
        },
    )
    assert turn.status_code == 200  # T15


# -- turn speech ------------------------------------------------------------------


def test_turn_zero_speech_synthesizes_the_opening_question(harness) -> None:
    session = start(harness)

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/speech")

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == harness.speech.AUDIO
    assert harness.speech.synthesized_texts == [session["student_text"]]  # ADR-0003


def test_speech_for_missing_turn_is_404(harness) -> None:
    session = start(harness)

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/3/speech")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TURN_NOT_FOUND"


def test_speech_for_unknown_session_is_404(harness) -> None:
    response = harness.client.get("/api/sessions/nope/turns/0/speech")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SESSION_NOT_FOUND"


def test_synthesis_failure_is_non_fatal_for_the_session(harness) -> None:
    session = start(harness)
    harness.speech.fail_synthesize = True

    response = harness.client.get(f"/api/sessions/{session['session_id']}/turns/0/speech")
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "SPEECH_FAILED"  # AC-TTS-4 (superseded form)

    turn = harness.client.post(
        f"/api/sessions/{session['session_id']}/turns",
        json={
            "learner_text": "still teaching",
            "input_mode": "text",
            "client_turn_id": str(uuid4()),
        },
    )
    assert turn.status_code == 200  # the session stays active and usable
