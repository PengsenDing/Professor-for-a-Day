"""Deterministic graph-growth semantics: slugs and the append-only merge (ADR-0004)."""

from app.schemas import Concept, PrerequisiteEdge
from app.services.graph_summarizer import (
    GraphExtraction,
    ProposedConcept,
    ProposedEdge,
    merge_extraction,
)
from app.services.slug import slugify


def _concept(concept_id: str, title: str | None = None) -> Concept:
    return Concept(id=concept_id, title=title or concept_id.replace("-", " ").title(), summary="s")


def _edge(source: str, target: str) -> PrerequisiteEdge:
    return PrerequisiteEdge.model_validate({"from": source, "to": target})


class TestSlugify:
    def test_lowercases_and_hyphenates(self) -> None:
        assert slugify("How Compilers Work!") == "how-compilers-work"

    def test_collapses_and_trims_separators(self) -> None:
        assert slugify("  a --- b  ") == "a-b"

    def test_caps_length_without_trailing_hyphen(self) -> None:
        slug = slugify("x" * 59 + " y")
        assert len(slug) <= 60
        assert not slug.endswith("-")

    def test_falls_back_when_nothing_survives(self) -> None:
        assert slugify("!!! ???") == "topic"
        assert slugify("Привет") == "topic"


class TestMergeExtraction:
    def test_accepts_new_concepts_and_edges(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("compilers")],
            existing_edges=[],
            extraction=GraphExtraction(
                concepts=[
                    ProposedConcept(id="lexing", title="Lexing", summary="Tokens."),
                    ProposedConcept(title="Parsing", summary="Trees."),
                ],
                edges=[
                    ProposedEdge(from_concept="lexing", to_concept="parsing"),
                    ProposedEdge(from_concept="parsing", to_concept="compilers"),
                ],
            ),
            max_new_concepts=8,
        )
        assert [concept.id for concept in result.added_concepts] == ["lexing", "parsing"]
        assert [(edge.from_, edge.to) for edge in result.added_edges] == [
            ("lexing", "parsing"),
            ("parsing", "compilers"),
        ]

    def test_dedupes_against_existing_by_slug_and_title(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("gradient-descent", "Gradient Descent")],
            existing_edges=[],
            extraction=GraphExtraction(
                concepts=[
                    ProposedConcept(id="gradient-descent", title="Gradient descent"),
                    ProposedConcept(title="Gradient Descent!", summary="dup by title"),
                    ProposedConcept(title="Learning Rate", summary="New."),
                ],
                edges=[ProposedEdge(from_concept="gradient-descent", to_concept="learning-rate")],
            ),
            max_new_concepts=8,
        )
        assert [concept.id for concept in result.added_concepts] == ["learning-rate"]
        assert [(edge.from_, edge.to) for edge in result.added_edges] == [
            ("gradient-descent", "learning-rate")
        ]

    def test_dedupes_proposals_against_each_other_first_wins(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("root")],
            existing_edges=[],
            extraction=GraphExtraction(
                concepts=[
                    ProposedConcept(id="parsing", title="Parsing", summary="first"),
                    ProposedConcept(title="parsing?", summary="same slug via title"),
                ],
                edges=[],
            ),
            max_new_concepts=8,
        )
        assert len(result.added_concepts) == 1
        assert result.added_concepts[0].summary == "first"

    def test_caps_new_concepts_and_drops_their_edges(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("root")],
            existing_edges=[],
            extraction=GraphExtraction(
                concepts=[ProposedConcept(title=f"Concept {i}") for i in range(5)],
                edges=[ProposedEdge(from_concept="concept-0", to_concept="concept-4")],
            ),
            max_new_concepts=2,
        )
        assert [concept.id for concept in result.added_concepts] == ["concept-0", "concept-1"]
        assert result.added_edges == []  # its endpoint was capped away

    def test_rejects_cycles_self_loops_unknowns_and_duplicates(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("a"), _concept("b")],
            existing_edges=[_edge("a", "b")],
            extraction=GraphExtraction(
                concepts=[],
                edges=[
                    ProposedEdge(from_concept="b", to_concept="a"),  # cycle with a->b
                    ProposedEdge(from_concept="a", to_concept="a"),  # self-loop
                    ProposedEdge(from_concept="a", to_concept="b"),  # duplicate
                    ProposedEdge(from_concept="a", to_concept="ghost"),  # unknown endpoint
                ],
            ),
            max_new_concepts=8,
        )
        assert result.added_edges == []

    def test_edges_resolve_through_titles(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("compilers", "Compilers")],
            existing_edges=[],
            extraction=GraphExtraction(
                concepts=[ProposedConcept(title="Lexing", summary="Tokens.")],
                edges=[ProposedEdge(from_concept="Lexing", to_concept="Compilers")],
            ),
            max_new_concepts=8,
        )
        assert [(edge.from_, edge.to) for edge in result.added_edges] == [
            ("lexing", "compilers")
        ]

    def test_blank_titles_are_dropped_and_summary_falls_back(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("root")],
            existing_edges=[],
            extraction=GraphExtraction(
                concepts=[
                    ProposedConcept(title="   "),
                    ProposedConcept(title="Kept", summary="  "),
                ],
                edges=[],
            ),
            max_new_concepts=8,
        )
        assert [concept.id for concept in result.added_concepts] == ["kept"]
        assert result.added_concepts[0].summary == "Kept"

    def test_empty_extraction_is_a_no_op(self) -> None:
        result = merge_extraction(
            existing_concepts=[_concept("root")],
            existing_edges=[],
            extraction=GraphExtraction(),
            max_new_concepts=8,
        )
        assert result.added_concepts == []
        assert result.added_edges == []
