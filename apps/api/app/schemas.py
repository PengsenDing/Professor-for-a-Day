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


class HealthResponse(BaseModel):
    ok: bool
    model: str


class ErrorResponse(BaseModel):
    error: str
