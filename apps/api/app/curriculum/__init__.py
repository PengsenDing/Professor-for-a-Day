"""Version-controlled Concept Catalog (ADR-0002, AC-CAT-7).

The catalog lives in `catalog.json` next to this module. Nothing mutates it at
runtime and no LLM call can add, remove, or reconnect a node or edge.
"""

from functools import lru_cache
from pathlib import Path

from ..schemas import Curriculum, PrerequisiteEdge

_CATALOG_PATH = Path(__file__).parent / "catalog.json"


@lru_cache
def load_catalog() -> Curriculum:
    """Load and validate the catalog, failing loudly on structural problems (AC-CAT-5)."""
    catalog = Curriculum.model_validate_json(_CATALOG_PATH.read_text(encoding="utf-8"))
    check_edges({concept.id for concept in catalog.concepts}, catalog.edges)
    return catalog


def check_edges(concept_ids: set[str], edges: list[PrerequisiteEdge]) -> None:
    """Reject edges with unknown endpoints or a cycle.

    Shared by the version-controlled catalog and user-graph merging, so every
    graph the app serves satisfies the same invariants.
    """
    for edge in edges:
        unknown = {edge.from_, edge.to} - concept_ids
        if unknown:
            raise ValueError(f"Prerequisite edge references unknown concepts: {sorted(unknown)}")

    # Kahn's algorithm: if a topological order cannot consume every node, there is a cycle.
    successors: dict[str, list[str]] = {concept_id: [] for concept_id in concept_ids}
    in_degree: dict[str, int] = dict.fromkeys(concept_ids, 0)
    for edge in edges:
        successors[edge.from_].append(edge.to)
        in_degree[edge.to] += 1

    ready = [concept_id for concept_id, degree in in_degree.items() if degree == 0]
    visited = 0
    while ready:
        node = ready.pop()
        visited += 1
        for successor in successors[node]:
            in_degree[successor] -= 1
            if in_degree[successor] == 0:
                ready.append(successor)

    if visited != len(concept_ids):
        raise ValueError("The prerequisite edge set contains a cycle")
