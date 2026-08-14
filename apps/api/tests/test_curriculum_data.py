"""AC-CAT-2/4/5/7: the version-controlled catalog is structurally sound."""

from app.curriculum import load_catalog


def test_catalog_loads_with_15_concepts_and_acyclic_edges() -> None:
    catalog = load_catalog()

    assert len(catalog.concepts) == 15
    concept_ids = {concept.id for concept in catalog.concepts}
    assert len(concept_ids) == 15

    for edge in catalog.edges:
        assert edge.from_ in concept_ids
        assert edge.to in concept_ids
    # load_catalog raises on a cycle (AC-CAT-5); reaching this line asserts acyclicity.
