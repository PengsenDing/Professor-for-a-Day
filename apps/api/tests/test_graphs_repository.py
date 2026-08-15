"""Graph repository semantics against a real MongoDB; skips when none is reachable."""

from app.repositories.graphs import GraphRepository


def _concept(concept_id: str, rubric: dict | None = None) -> dict:
    return {"id": concept_id, "title": concept_id.title(), "summary": "s", "rubric": rubric}


async def test_insert_get_list_roundtrip(mongo_database) -> None:
    repository = GraphRepository(mongo_database)
    await repository.ensure_indexes()

    created = await repository.insert(
        title="Compilers",
        concepts=[_concept("compilers", {"concept_id": "compilers"}), _concept("lexing")],
        edges=[{"from": "lexing", "to": "compilers"}],
    )
    graph_id = str(created["_id"])

    fetched = await repository.get(graph_id)
    assert fetched is not None
    assert fetched["title"] == "Compilers"
    assert fetched["version"] == 1
    assert [entry["id"] for entry in fetched["concepts"]] == ["compilers", "lexing"]

    summaries = await repository.list_summaries()
    assert [str(document["_id"]) for document in summaries] == [graph_id]
    # The projection carries counts, never rubric payloads.
    assert "rubric" not in summaries[0]["concepts"][0]
    assert len(summaries[0]["concepts"]) == 2

    assert await repository.get("not-an-object-id") is None


async def test_append_respects_optimistic_version(mongo_database) -> None:
    repository = GraphRepository(mongo_database)
    created = await repository.insert(title="T", concepts=[_concept("a")], edges=[])
    graph_id = str(created["_id"])

    appended = await repository.append(
        graph_id,
        expected_version=1,
        new_concepts=[_concept("b")],
        new_edges=[{"from": "a", "to": "b"}],
    )
    assert appended is True

    # A writer holding the stale version must lose.
    stale = await repository.append(
        graph_id, expected_version=1, new_concepts=[_concept("c")], new_edges=[]
    )
    assert stale is False

    stored = await repository.get(graph_id)
    assert stored["version"] == 2
    assert [entry["id"] for entry in stored["concepts"]] == ["a", "b"]
    assert stored["edges"] == [{"from": "a", "to": "b"}]


async def test_delete_roundtrip(mongo_database) -> None:
    repository = GraphRepository(mongo_database)
    created = await repository.insert(title="T", concepts=[_concept("a")], edges=[])
    graph_id = str(created["_id"])

    assert await repository.delete(graph_id) is True
    assert await repository.get(graph_id) is None
    # Deleting again (or a malformed id) is a no-op, not an error.
    assert await repository.delete(graph_id) is False
    assert await repository.delete("not-an-object-id") is False


async def test_set_concept_rubric_only_fills_missing(mongo_database) -> None:
    repository = GraphRepository(mongo_database)
    created = await repository.insert(title="T", concepts=[_concept("a")], edges=[])
    graph_id = str(created["_id"])

    first = await repository.set_concept_rubric(graph_id, "a", {"concept_id": "a"})
    assert first is True

    # The losing side of a generation race must not overwrite the winner.
    second = await repository.set_concept_rubric(graph_id, "a", {"concept_id": "other"})
    assert second is False

    stored = await repository.get(graph_id)
    assert stored["concepts"][0]["rubric"] == {"concept_id": "a"}

    unknown_concept = await repository.set_concept_rubric(graph_id, "ghost", {})
    assert unknown_concept is False
