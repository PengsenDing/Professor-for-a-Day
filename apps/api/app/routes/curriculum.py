"""Concept catalog route (`getCurriculum`).

Serves version-controlled data only: no LLM call, no rubric content, no
per-learner state (AC-CAT-1/6/8).
"""

from fastapi import APIRouter

from ..curriculum import load_catalog
from ..schemas import Curriculum, ErrorEnvelope

router = APIRouter(tags=["curriculum"])


@router.get(
    "/api/curriculum",
    operation_id="getCurriculum",
    response_model=Curriculum,
    responses={503: {"model": ErrorEnvelope}},
)
async def get_curriculum() -> Curriculum:
    """Concept catalog and prerequisite edges."""
    return load_catalog()
