"""Liveness endpoint (`getHealth`)."""

from fastapi import APIRouter, Request

from ..db import MongoConnection
from ..schemas import Database, Health
from ..services.llm import resolve_model

router = APIRouter(tags=["system"])


@router.get("/health", operation_id="getHealth", response_model=Health)
async def get_health(request: Request) -> Health:
    """Process and database health. Never invokes an LLM or speech provider."""
    mongo: MongoConnection | None = getattr(request.app.state, "mongo", None)
    database = Database.up if mongo is not None and await mongo.ping() else Database.down

    return Health(ok=True, model=resolve_model(), database=database)
