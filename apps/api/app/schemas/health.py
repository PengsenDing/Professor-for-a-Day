"""`Health` contract schema."""

from enum import StrEnum

from pydantic import BaseModel, Field


class Database(StrEnum):
    up = "up"
    down = "down"


class Health(BaseModel):
    ok: bool
    model: str = Field(description="The configured default LLM model name.")
    database: Database
