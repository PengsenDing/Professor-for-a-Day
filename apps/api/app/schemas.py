"""Request/response contracts for the frontend.

These mirror what `packages/shared` will eventually declare for the web app.
"""

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(min_length=1, max_length=32_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    model: str | None = Field(default=None, description="Overrides DEUTSCHLANDGPT_MODEL.")


class ChatResponse(BaseModel):
    reply: str
    model: str


class CreateConversationRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class AppendMessagesRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)


class HealthResponse(BaseModel):
    """`ok` reports the process; `database` is separate so a Mongo outage is visible
    without making the whole endpoint fail."""

    ok: bool
    model: str
    database: Literal["up", "down"]


class ErrorResponse(BaseModel):
    error: str
