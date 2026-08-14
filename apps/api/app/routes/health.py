"""Liveness endpoint."""

from fastapi import APIRouter

from ..schemas import HealthResponse
from ..services.llm import resolve_model

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, model=resolve_model())
