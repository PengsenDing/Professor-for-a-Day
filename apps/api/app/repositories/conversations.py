"""Conversation persistence.

Messages are embedded in the conversation document: a teaching session is always
read as a whole, and one round trip beats a join. If sessions ever grow past the
16MB document limit, messages move to their own collection behind this same API.
"""

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import DESCENDING, ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

from ..models import Conversation, StoredMessage, utcnow
from ..schemas import ChatMessage

COLLECTION_NAME = "conversations"

Document = dict[str, Any]


def _to_object_id(conversation_id: str) -> ObjectId | None:
    """Return None for malformed ids so callers answer 404 instead of raising."""
    try:
        return ObjectId(conversation_id)
    except (InvalidId, TypeError):
        return None


def _to_conversation(document: Document) -> Conversation:
    return Conversation(
        id=str(document["_id"]),
        title=document.get("title"),
        messages=[StoredMessage(**message) for message in document.get("messages", [])],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


class ConversationRepository:
    def __init__(self, database: AsyncDatabase[Document]) -> None:
        self._collection: AsyncCollection[Document] = database[COLLECTION_NAME]

    async def ensure_indexes(self) -> None:
        """Idempotent, so it is safe to run on every startup."""
        await self._collection.create_index([("updated_at", DESCENDING)], name="updated_at_desc")

    async def create(self, title: str | None = None) -> Conversation:
        now = utcnow()
        document: Document = {
            "title": title,
            "messages": [],
            "created_at": now,
            "updated_at": now,
        }
        result = await self._collection.insert_one(document)
        return _to_conversation({**document, "_id": result.inserted_id})

    async def get(self, conversation_id: str) -> Conversation | None:
        object_id = _to_object_id(conversation_id)
        if object_id is None:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return _to_conversation(document) if document else None

    async def append_messages(
        self, conversation_id: str, messages: list[ChatMessage]
    ) -> Conversation | None:
        """Append a turn and bump `updated_at`, returning the conversation after the write."""
        object_id = _to_object_id(conversation_id)
        if object_id is None:
            return None

        now = utcnow()
        stored = [
            {"role": message.role, "content": message.content, "created_at": now}
            for message in messages
        ]

        document = await self._collection.find_one_and_update(
            {"_id": object_id},
            {"$push": {"messages": {"$each": stored}}, "$set": {"updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return _to_conversation(document) if document else None

    async def list_recent(self, limit: int = 20) -> list[Conversation]:
        cursor = self._collection.find().sort("updated_at", DESCENDING).limit(limit)
        return [_to_conversation(document) async for document in cursor]

    async def delete(self, conversation_id: str) -> bool:
        object_id = _to_object_id(conversation_id)
        if object_id is None:
            return False

        result = await self._collection.delete_one({"_id": object_id})
        return result.deleted_count == 1
