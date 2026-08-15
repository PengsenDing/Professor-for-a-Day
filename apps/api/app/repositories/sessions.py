"""Teaching Session persistence (AC-PER).

The only module that knows the session document structure, and the only place
the pymongo driver is touched (AC-PER-7). Turns are embedded in the session
document, so one `update_one` persists the turn, the updated progress, and the
updated counters atomically (AC-PER-10, AC-TRN-9).
"""

from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

COLLECTION_NAME = "teaching_sessions"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class SessionRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection = database[COLLECTION_NAME]

    async def ensure_indexes(self) -> None:
        """Idempotent index creation (AC-PER-8)."""
        await self._collection.create_index("created_at")
        await self._collection.create_index("turns.client_turn_id")

    async def create(
        self,
        *,
        concept_id: str,
        concept_title: str,
        mode: str,
        student_text: str,
        graph_id: str | None,
        topic: str | None = None,
        rubric: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = _utcnow()
        document: dict[str, Any] = {
            "graph_id": graph_id,
            "concept_id": concept_id,
            "concept_title": concept_title,
            "topic": topic,
            # Freeform sessions embed their generated rubric because no graph
            # document exists yet; it is internal and never leaves the server.
            "rubric": rubric,
            "graph_update": None,
            "mode": mode,
            "status": "active",
            "end_reason": None,
            "learner_turn_count": 0,
            "progress_percent": 0,
            "confirmed_point_ids": [],
            "posed_misconception_ids": [],
            "resolved_misconception_ids": [],
            "introduced_misconception_summaries": [],
            "opening_text": student_text,
            "turns": [],
            "report": None,
            "final_score": None,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._collection.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    async def get(self, session_id: str) -> dict[str, Any] | None:
        object_id = _parse_id(session_id)
        if object_id is None:
            return None
        return await self._collection.find_one({"_id": object_id})

    async def append_turn(
        self,
        session_id: str,
        *,
        expected_learner_turn_count: int,
        turn: dict[str, Any],
        session_fields: dict[str, Any],
    ) -> bool:
        """Persist one turn and the resulting session state in a single write.

        The filter pins the session to `active` at the expected turn count, so a
        concurrent submission can never produce two turns with one number
        (AC-TRN-10); the caller retries or fails when this returns False.
        """
        object_id = _parse_id(session_id)
        if object_id is None:
            return False
        result = await self._collection.update_one(
            {
                "_id": object_id,
                "status": "active",
                "learner_turn_count": expected_learner_turn_count,
            },
            {
                "$push": {"turns": turn},
                "$set": {**session_fields, "updated_at": _utcnow()},
                "$inc": {"learner_turn_count": 1},
            },
        )
        return result.modified_count == 1

    async def finish(
        self,
        session_id: str,
        *,
        end_reason: str,
        final_percent: int,
        report: dict[str, Any],
        graph_update: dict[str, Any] | None = None,
        graph_id: str | None = None,
    ) -> dict[str, Any] | None:
        """End an active session; on an already-ended one return it unchanged
        so finishing stays idempotent (AC-END-4).

        `graph_update` persists with the exit write so idempotent replays never
        re-summarize; `graph_id` backfills a freeform session once its graph
        exists.
        """
        object_id = _parse_id(session_id)
        if object_id is None:
            return None
        set_fields: dict[str, Any] = {
            "status": "ended",
            "end_reason": end_reason,
            "progress_percent": final_percent,
            "final_score": final_percent,
            "report": report,
            "graph_update": graph_update,
            "updated_at": _utcnow(),
        }
        if graph_id is not None:
            set_fields["graph_id"] = graph_id
        updated = await self._collection.find_one_and_update(
            {"_id": object_id, "status": "active"},
            {"$set": set_fields},
            return_document=True,
        )
        if updated is not None:
            return updated
        return await self._collection.find_one({"_id": object_id})


def _parse_id(session_id: str) -> ObjectId | None:
    try:
        return ObjectId(session_id)
    except (InvalidId, TypeError):
        return None


__all__ = ["COLLECTION_NAME", "PyMongoError", "SessionRepository"]
