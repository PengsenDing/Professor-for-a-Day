"""Liveness endpoint."""

from fastapi import APIRouter, Request

from ..db import MongoConnection
from ..schemas import HealthResponse
from ..services.llm import resolve_model

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    mongo: MongoConnection | None = getattr(request.app.state, "mongo", None)
    database = "up" if mongo is not None and await mongo.ping() else "down"

    return HealthResponse(ok=True, model=resolve_model(), database=database)
