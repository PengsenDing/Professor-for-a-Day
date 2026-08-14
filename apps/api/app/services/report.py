"""Teacher Report builder (AC-END).

Deterministic: every field is grounded in this session's Judge evaluations and
the version-controlled rubric/catalog — nothing is generated, so the report can
never contradict the computed progress (AC-END-7/9) or leak unconfirmed rubric
labels (AC-RUB-6).
"""

from ..curriculum.rubrics import Rubric
from ..schemas import ConceptRef, Curriculum, TeacherReport
from .scoring import ScoringState


def build_report(
    *,
    rubric: Rubric,
    catalog: Curriculum,
    concept_id: str,
    state: ScoringState,
    final_percent: int,
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


def _next_concept(catalog: Curriculum, concept_id: str) -> ConceptRef:
    """A successor in the prerequisite graph when one exists; otherwise a neighbor;
    otherwise any other concept (AC-END-10). Deterministic by catalog order."""
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
    raise ValueError("The catalog has no concept to recommend")
