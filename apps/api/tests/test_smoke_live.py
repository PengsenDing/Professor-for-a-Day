"""T21/T22 — opt-in live smoke tests. Never run in CI or a default local run.

Run manually before the demo rehearsal with real credentials in apps/api/.env:

    RUN_LIVE_SMOKE=1 pytest tests/test_smoke_live.py -v
"""

import os

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_SMOKE") != "1",
    reason="live smoke tests are opt-in (set RUN_LIVE_SMOKE=1)",
)


async def test_judge_and_student_produce_parseable_output_live() -> None:
    """T21: both LLM roles against live DeutschlandGPT."""
    from app.curriculum.rubrics import load_rubrics
    from app.schemas import Mode
    from app.services.judge import JudgeAdapter
    from app.services.scoring import ScoringState
    from app.services.student import StudentAdapter

    rubric = load_rubrics()["gradient-descent"]

    student = StudentAdapter()
    opening = await student.opening_question(
        rubric=rubric, concept_title="Gradient Descent", mode=Mode.confident
    )
    assert opening.strip()

    judge = JudgeAdapter()
    evaluation = await judge.evaluate(
        rubric=rubric,
        state=ScoringState(),
        transcript=[("student", opening)],
        learner_text=(
            "Gradient descent computes the gradient of the loss with respect to the "
            "parameters and repeatedly steps in the opposite direction, scaled by the "
            "learning rate, until the loss stops improving."
        ),
        mode=Mode.confident,
    )
    assert evaluation.recommended_next_probe


async def test_elevenlabs_transcription_and_synthesis_live() -> None:
    """T22: real ElevenLabs synthesis, then transcription of that audio."""
    from app.services.speech import get_speech_service

    speech = get_speech_service()
    audio = await speech.synthesize("Gradient descent steps against the gradient.")
    assert len(audio) > 1000

    transcript = await speech.transcribe(audio)
    assert transcript.strip()
