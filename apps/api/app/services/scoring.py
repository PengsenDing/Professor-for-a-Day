"""The scoring engine (AC-JDG-5…9).

A pure function of (rubric, accumulated state, new Judge evaluation). No HTTP,
no Mongo, no LLM. Confirmation is sticky, progress is monotonic, and the
misconception gate caps progress at 99 until at least one misconception
challenge was posed and every posed challenge is resolved.
"""

from dataclasses import dataclass, replace

from ..curriculum.rubrics import Rubric
from .evaluation import JudgeEvaluation

GATE_CAP = 99


@dataclass(frozen=True)
class ScoringState:
    confirmed_point_ids: frozenset[str] = frozenset()
    # Ordered so the "active" misconception is the oldest unresolved one.
    posed_misconception_ids: tuple[str, ...] = ()
    resolved_misconception_ids: frozenset[str] = frozenset()
    introduced_misconception_summaries: tuple[str, ...] = ()

    def active_misconception_id(self) -> str | None:
        for misconception_id in self.posed_misconception_ids:
            if misconception_id not in self.resolved_misconception_ids:
                return misconception_id
        return None

    def gate_satisfied(self) -> bool:
        return bool(self.posed_misconception_ids) and all(
            misconception_id in self.resolved_misconception_ids
            for misconception_id in self.posed_misconception_ids
        )


@dataclass(frozen=True)
class ScoringResult:
    state: ScoringState
    percent: int
    newly_confirmed_point_ids: tuple[str, ...] = ()
    newly_resolved_misconception_ids: tuple[str, ...] = ()
    discarded_point_ids: tuple[str, ...] = ()
    discarded_misconception_ids: tuple[str, ...] = ()


def pose_misconception(state: ScoringState, misconception_id: str) -> ScoringState:
    """Record that the AI Student posed a misconception challenge."""
    if misconception_id in state.posed_misconception_ids:
        return state
    return replace(
        state, posed_misconception_ids=(*state.posed_misconception_ids, misconception_id)
    )


def compute_percent(rubric: Rubric, state: ScoringState) -> int:
    percent = round(len(state.confirmed_point_ids) / len(rubric.points) * 100)
    percent = max(0, min(100, percent))
    if not state.gate_satisfied():
        percent = min(percent, GATE_CAP)
    return percent


def apply_evaluation(
    rubric: Rubric, state: ScoringState, evaluation: JudgeEvaluation
) -> ScoringResult:
    """Fold one Judge evaluation into the accumulated state.

    Ids absent from the rubric are discarded and reported so the caller can log
    them (AC-JDG-3); they never confirm a point or move progress.
    """
    valid_points = rubric.point_ids()
    valid_misconceptions = rubric.misconception_ids()

    newly_confirmed: list[str] = []
    discarded_points: list[str] = []
    for demonstrated in evaluation.newly_demonstrated_points:
        if demonstrated.point_id not in valid_points:
            discarded_points.append(demonstrated.point_id)
        elif demonstrated.point_id not in state.confirmed_point_ids:
            newly_confirmed.append(demonstrated.point_id)

    newly_resolved: list[str] = []
    discarded_misconceptions: list[str] = []
    for misconception_id in evaluation.corrected_misconceptions:
        if misconception_id not in valid_misconceptions:
            discarded_misconceptions.append(misconception_id)
        elif misconception_id not in state.resolved_misconception_ids:
            newly_resolved.append(misconception_id)

    introduced = tuple(
        introduced.summary
        for introduced in evaluation.newly_introduced_misconceptions
        if introduced.summary not in state.introduced_misconception_summaries
    )

    new_state = replace(
        state,
        confirmed_point_ids=state.confirmed_point_ids | set(newly_confirmed),
        resolved_misconception_ids=state.resolved_misconception_ids | set(newly_resolved),
        introduced_misconception_summaries=(
            *state.introduced_misconception_summaries,
            *introduced,
        ),
    )

    return ScoringResult(
        state=new_state,
        percent=compute_percent(rubric, new_state),
        newly_confirmed_point_ids=tuple(newly_confirmed),
        newly_resolved_misconception_ids=tuple(newly_resolved),
        discarded_point_ids=tuple(discarded_points),
        discarded_misconception_ids=tuple(discarded_misconceptions),
    )
