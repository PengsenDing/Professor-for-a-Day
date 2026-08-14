"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from .db import MongoConnection
from .repositories.conversations import ConversationRepository


def get_mongo(request: Request) -> MongoConnection:
    mongo: MongoConnection | None = getattr(request.app.state, "mongo", None)
    if mongo is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The database is not available.",
        )
    return mongo


def get_conversation_repository(
    mongo: Annotated[MongoConnection, Depends(get_mongo)],
) -> ConversationRepository:
    return ConversationRepository(mongo.database)


ConversationRepositoryDep = Annotated[
    ConversationRepository, Depends(get_conversation_repository)
]
