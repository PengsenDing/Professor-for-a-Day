"""Persistence documents.

Kept separate from the API contracts in `schemas.py`: the stored shape carries
timestamps and ids, and the two are free to diverge as the schema grows.
"""

from datetime import UTC, datetime

from pydantic import BaseModel, Field

from .schemas import Role


def utcnow() -> datetime:
    """Timezone-aware UTC, truncated to milliseconds.

    BSON datetimes only keep milliseconds, so truncating at the source makes the
    value we return from a write equal to the value a later read gives back.
    """
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


class StoredMessage(BaseModel):
    role: Role
    content: str
    created_at: datetime


class Conversation(BaseModel):
    """A teaching session: its message history plus bookkeeping."""

    id: str
    title: str | None = None
    messages: list[StoredMessage] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
