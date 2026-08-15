"""Teacher Report builder (AC-END).

Deterministic: every field is grounded in this session's Judge evaluations and
the version-controlled rubric/catalog — nothing is generated, so the report can
never contradict the computed progress (AC-END-7/9) or leak unconfirmed rubric
labels (AC-RUB-6).
"""

from typing import NamedTuple

from ..curriculum.rubrics import Rubric
from ..schemas import ConceptRef, Curriculum, DemonstratedEvidence, RubricPointRef, TeacherReport
from .evaluation import DemonstratedPoint
from .scoring import ScoringState


class EvidenceSource(NamedTuple):
    """One learner turn's contribution to the evidence trail."""

    turn_number: int
    learner_text: str
    demonstrated: list[DemonstratedPoint]


def collect_evidence(
    rubric: Rubric,
    state: ScoringState,
    sources: list[EvidenceSource],
) -> list[DemonstratedEvidence]:
    """Why each confirmed point was scored, in rubric order (AC-END-12).

    The quote is the learner's own words: it is surfaced only when the Judge's
    recorded evidence is a verbatim substring of that turn's submission — the
    same guard the mirror mechanism applies to misconception triggers. The
    Judge's free text is otherwise withheld, so nothing it wrote can leak.
    """
    first_demonstration: dict[str, tuple[int, str | None]] = {}
    for source in sources:
        for demonstrated in source.demonstrated:
            if demonstrated.point_id in first_demonstration:
                continue
            quote = demonstrated.evidence.strip()
            verbatim = quote if quote and quote in source.learner_text else None
            first_demonstration[demonstrated.point_id] = (source.turn_number, verbatim)

    evidence: list[DemonstratedEvidence] = []
    for point in rubric.points:
        if point.id not in state.confirmed_point_ids:
            continue
        demonstration = first_demonstration.get(point.id)
        if demonstration is None:
            # Confirmed before this feature existed (finish on an old session).
            continue
        turn_number, quote = demonstration
        evidence.append(
            DemonstratedEvidence(
                point=RubricPointRef(id=point.id, label=point.label),
                quote=quote,
                turn_number=turn_number,
            )
        )
    return evidence


def build_report(
    *,
    rubric: Rubric,
    catalog: Curriculum,
    concept_id: str,
    state: ScoringState,
    final_percent: int,
    evidence_sources: list[EvidenceSource] | None = None,
) -> TeacherReport:
    explained_well = [
        point.label for point in rubric.points if point.id in state.confirmed_point_ids
    ]

    misconceptions_corrected = [
        misconception.summary
        for misconception in rubric.misconceptions
        if misconception.id in state.resolved_misconception_ids
        and misconception.id in state.posed_misconception_ids
    ]

    gaps = [
        misconception.summary
        for misconception in rubric.misconceptions
        if misconception.id in state.posed_misconception_ids
        and misconception.id not in state.resolved_misconception_ids
    ]
    gaps.extend(state.introduced_misconception_summaries)

    return TeacherReport(
        final_percent=final_percent,
        explained_well=explained_well,
        evidence=collect_evidence(rubric, state, evidence_sources or []),
        misconceptions_corrected=misconceptions_corrected,
        gaps_and_accidental_implications=gaps,
        improvement_suggestion=_improvement_suggestion(state, final_percent),
        recommended_next_concept=_next_concept(catalog, concept_id),
        mastery_achieved=final_percent == 100,
    )


def _improvement_suggestion(state: ScoringState, final_percent: int) -> str:
    if final_percent == 100:
        return (
            "Consolidate your mastery: teach the concept again from scratch to someone "
            "new, without notes, and lead with a concrete worked example."
        )
    if state.active_misconception_id() is not None:
        return (
            "Address the student's open misunderstanding head-on: explain why it is "
            "wrong and back the correction with a concrete example."
        )
    return (
        "Walk through the concept step by step and support every claim with a concrete "
        "example, so each required idea is demonstrated explicitly."
    )


def _next_concept(catalog: Curriculum, concept_id: str) -> ConceptRef | None:
    """A successor in the prerequisite graph when one exists; otherwise a neighbor;
    otherwise any other concept; None on a single-concept graph (AC-END-10).
    Deterministic by catalog order."""
    titles = {concept.id: concept.title for concept in catalog.concepts}

    for edge in catalog.edges:
        if edge.from_ == concept_id:
            return ConceptRef(id=edge.to, title=titles[edge.to])
    for edge in catalog.edges:
        if edge.to == concept_id:
            return ConceptRef(id=edge.from_, title=titles[edge.from_])
    for concept in catalog.concepts:
        if concept.id != concept_id:
            return ConceptRef(id=concept.id, title=concept.title)
    return None
