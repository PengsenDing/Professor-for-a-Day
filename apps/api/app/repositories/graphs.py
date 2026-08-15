"""User knowledge-graph persistence (ADR-0004).

The only module that knows the `knowledge_graphs` document structure. A graph
document embeds its concepts (each with an optional cached generated rubric)
and prerequisite edges:

    {
        "_id": ObjectId,            # hex string is the public graph_id
        "title": "How Compilers Work",
        "version": 3,               # +1 per append; optimistic concurrency
        "concepts": [{"id", "title", "summary", "rubric": {...} | None}, ...],
        "edges": [{"from": "...", "to": "..."}, ...],
        "created_at": datetime,
        "updated_at": datetime,
    }

Rubric internals stay server-side: callers building API responses must project
concepts down to `id`/`title`/`summary` (AC-RUB-6 extends to generated rubrics).
"""

from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.asynchronous.database import AsyncDatabase

COLLECTION_NAME = "knowledge_graphs"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class GraphRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection = database[COLLECTION_NAME]

    async def ensure_indexes(self) -> None:
        """Idempotent index creation, mirroring the session repository."""
        await self._collection.create_index("created_at")

    async def list_summaries(self) -> list[dict[str, Any]]:
        """Every graph, oldest first, without rubric payloads."""
        cursor = self._collection.find(
            {},
            projection={"title": True, "concepts.id": True, "created_at": True},
            sort=[("created_at", 1)],
        )
        return [document async for document in cursor]

    async def get(self, graph_id: str) -> dict[str, Any] | None:
        object_id = _parse_id(graph_id)
        if object_id is None:
            return None
        return await self._collection.find_one({"_id": object_id})

    async def insert(
        self,
        *,
        title: str,
        concepts: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> dict[str, Any]:
        now = _utcnow()
        document: dict[str, Any] = {
            "title": title,
            "version": 1,
            "concepts": concepts,
            "edges": edges,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._collection.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    async def append(
        self,
        graph_id: str,
        *,
        expected_version: int,
        new_concepts: list[dict[str, Any]],
        new_edges: list[dict[str, Any]],
    ) -> bool:
        """Append-only growth guarded by an optimistic version check.

        False means the graph changed underneath the caller (or vanished); the
        caller re-reads, re-merges, and retries.
        """
        object_id = _parse_id(graph_id)
        if object_id is None:
            return False
        result = await self._collection.update_one(
            {"_id": object_id, "version": expected_version},
            {
                "$push": {
                    "concepts": {"$each": new_concepts},
                    "edges": {"$each": new_edges},
                },
                "$inc": {"version": 1},
                "$set": {"updated_at": _utcnow()},
            },
        )
        return result.modified_count == 1

    async def delete(self, graph_id: str) -> bool:
        """Remove one graph document; False when no such graph exists."""
        object_id = _parse_id(graph_id)
        if object_id is None:
            return False
        result = await self._collection.delete_one({"_id": object_id})
        return result.deleted_count == 1

    async def set_concept_rubric(
        self, graph_id: str, concept_id: str, rubric: dict[str, Any]
    ) -> bool:
        """Cache a generated rubric, only if the concept still has none.

        The `$elemMatch` on `rubric: None` makes concurrent generations
        race-safe: exactly one write wins and the loser re-reads the winner.
        """
        object_id = _parse_id(graph_id)
        if object_id is None:
            return False
        result = await self._collection.update_one(
            {
                "_id": object_id,
                "concepts": {"$elemMatch": {"id": concept_id, "rubric": None}},
            },
            {"$set": {"concepts.$.rubric": rubric, "updated_at": _utcnow()}},
        )
        return result.modified_count == 1


def _parse_id(graph_id: str) -> ObjectId | None:
    try:
        return ObjectId(graph_id)
    except (InvalidId, TypeError):
        return None


__all__ = ["COLLECTION_NAME", "GraphRepository"]
