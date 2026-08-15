"""T6/T7/T8 — the scoring engine is pure and enforces the contract's progress rules.

AC-JDG-3 (hallucinated ids discarded), AC-JDG-5 (percent formula), AC-JDG-6
(monotonic), AC-JDG-7/8 (misconception gate), AC-JDG-9 (no HTTP, no Mongo).
"""

from app.curriculum.rubrics import Rubric
from app.services.evaluation import (
    DemonstratedPoint,
    IntroducedMisconception,
    JudgeEvaluation,
    UnresolvedMisconception,
)
from app.services.scoring import ScoringState, apply_evaluation, pose_misconception

RUBRIC = Rubric.model_validate(
    {
        "concept_id": "gradient-descent",
        "points": [
            {"id": "gd-1", "label": "Gradient", "description": "States what a gradient is."},
            {"id": "gd-2", "label": "Downhill step", "description": "Opposite the gradient."},
            {"id": "gd-3", "label": "Iteration", "description": "Repeats until convergence."},
            {"id": "gd-4", "label": "Loss link", "description": "Ties steps to the loss."},
        ],
        "misconceptions": [
            {
                "id": "gd-mc-1",
                "summary": "Always finds the best",
                "belief": "It always reaches the very best solution.",
                "why_plausible": "Downhill motion sounds like it must reach the bottom.",
                "fallback_line": "Doesn't it always end up at the best possible model?",
                "correction": "Local minima.",
            },
            {
                "id": "gd-mc-2",
                "summary": "One step is enough",
                "belief": "One good step lands on the answer.",
                "why_plausible": "The gradient looks like it points at the solution.",
                "fallback_line": "Why repeat it — doesn't one step get you there?",
                "correction": "Iterative.",
            },
        ],
        "probes": {
            "beginner": ["What is a gradient?"],
            "confident": ["It always finds the global minimum."],
            "skeptic": ["Why not just solve analytically?"],
        },
    }
)


def evaluation(
    points: list[str] | None = None,
    corrected: list[str] | None = None,
    unresolved: list[str] | None = None,
    introduced: list[str] | None = None,
) -> JudgeEvaluation:
    return JudgeEvaluation(
        newly_demonstrated_points=[
            DemonstratedPoint(point_id=point_id, evidence="quote") for point_id in points or []
        ],
        corrected_misconceptions=corrected or [],
        unresolved_misconceptions=[
            UnresolvedMisconception(misconception_id=m, summary="still open")
            for m in unresolved or []
        ],
        newly_introduced_misconceptions=[
            IntroducedMisconception(summary=s) for s in introduced or []
        ],
        recommended_next_probe="probe next",
    )


def test_percent_is_rounded_coverage() -> None:
    result = apply_evaluation(RUBRIC, ScoringState(), evaluation(points=["gd-1"]))
    assert result.percent == 25

    result = apply_evaluation(RUBRIC, result.state, evaluation(points=["gd-2", "gd-3"]))
    assert result.percent == 75


def test_hallucinated_ids_are_discarded_and_do_not_move_progress() -> None:
    result = apply_evaluation(
        RUBRIC, ScoringState(), evaluation(points=["nope-1"], corrected=["nope-mc"])
    )
    assert result.percent == 0
    assert result.discarded_point_ids == ("nope-1",)
    assert result.discarded_misconception_ids == ("nope-mc",)
    assert result.newly_confirmed_point_ids == ()


def test_confirmations_are_sticky_and_progress_monotonic() -> None:
    first = apply_evaluation(RUBRIC, ScoringState(), evaluation(points=["gd-1", "gd-2"]))
    assert first.percent == 50

    # A later evaluation omitting gd-1/gd-2 must not lower progress (AC-JDG-6).
    second = apply_evaluation(RUBRIC, first.state, evaluation())
    assert second.percent == 50
    assert second.state.confirmed_point_ids == {"gd-1", "gd-2"}


def test_gate_caps_at_99_when_no_misconception_was_posed() -> None:
    result = apply_evaluation(
        RUBRIC, ScoringState(), evaluation(points=["gd-1", "gd-2", "gd-3", "gd-4"])
    )
    assert result.percent == 99  # AC-JDG-7(a)


def test_gate_caps_at_99_while_posed_misconception_is_unresolved() -> None:
    state = pose_misconception(ScoringState(), "gd-mc-1")
    result = apply_evaluation(
        RUBRIC, state, evaluation(points=["gd-1", "gd-2", "gd-3", "gd-4"])
    )
    assert result.percent == 99  # AC-JDG-7(b)


def test_100_requires_full_coverage_and_resolved_posed_misconception() -> None:
    state = pose_misconception(ScoringState(), "gd-mc-1")
    covered = apply_evaluation(
        RUBRIC, state, evaluation(points=["gd-1", "gd-2", "gd-3", "gd-4"])
    )
    final = apply_evaluation(RUBRIC, covered.state, evaluation(corrected=["gd-mc-1"]))
    assert final.percent == 100  # AC-JDG-8
    assert final.newly_resolved_misconception_ids == ("gd-mc-1",)


def test_resolved_misconception_alone_does_not_reach_100() -> None:
    state = pose_misconception(ScoringState(), "gd-mc-1")
    result = apply_evaluation(
        RUBRIC, state, evaluation(points=["gd-1", "gd-2", "gd-3"], corrected=["gd-mc-1"])
    )
    assert result.percent == 75


def test_newly_covered_points_lists_only_this_turn() -> None:
    first = apply_evaluation(RUBRIC, ScoringState(), evaluation(points=["gd-1"]))
    second = apply_evaluation(
        RUBRIC, first.state, evaluation(points=["gd-1", "gd-2"])
    )
    assert second.newly_confirmed_point_ids == ("gd-2",)  # AC-TRN-11


def test_introduced_misconceptions_accumulate_for_the_report() -> None:
    result = apply_evaluation(
        RUBRIC, ScoringState(), evaluation(introduced=["thinks loss is accuracy"])
    )
    assert result.state.introduced_misconception_summaries == ("thinks loss is accuracy",)


def test_active_misconception_is_oldest_unresolved_posed() -> None:
    state = pose_misconception(ScoringState(), "gd-mc-1")
    state = pose_misconception(state, "gd-mc-2")
    assert state.active_misconception_id() == "gd-mc-1"

    result = apply_evaluation(RUBRIC, state, evaluation(corrected=["gd-mc-1"]))
    assert result.state.active_misconception_id() == "gd-mc-2"
