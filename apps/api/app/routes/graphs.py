"""Knowledge-graph routes (`listGraphs`, `getGraphCurriculum`).

Serve graph structure only: no LLM call, no rubric content, no per-learner
state (AC-CAT-1/6/8 extended to user graphs by ADR-0005).
"""

from fastapi import APIRouter, Response

from ..dependencies import GraphServiceDep
from ..errors import ApiError
from ..schemas import Curriculum, ErrorCode, ErrorEnvelope, GraphList

router = APIRouter(tags=["graphs"])


@router.get(
    "/api/graphs",
    operation_id="listGraphs",
    response_model=GraphList,
    responses={503: {"model": ErrorEnvelope}},
)
async def list_graphs(graph_service: GraphServiceDep) -> GraphList:
    """List knowledge graphs: builtin first, then user graphs oldest-first."""
    return await graph_service.list_graphs()


@router.get(
    "/api/graphs/{graph_id}/curriculum",
    operation_id="getGraphCurriculum",
    response_model=Curriculum,
    responses={404: {"model": ErrorEnvelope}, 503: {"model": ErrorEnvelope}},
)
async def get_graph_curriculum(graph_id: str, graph_service: GraphServiceDep) -> Curriculum:
    """One graph's concepts and prerequisite edges.

    A malformed id can never match a graph, so it falls out as the contract's
    404 rather than a separate validation shape.
    """
    curriculum = await graph_service.get_curriculum(graph_id)
    if curriculum is None:
        raise ApiError(404, ErrorCode.GRAPH_NOT_FOUND, "No such knowledge graph.")
    return curriculum


@router.delete(
    "/api/graphs/{graph_id}",
    operation_id="deleteGraph",
    status_code=204,
    responses={
        404: {"model": ErrorEnvelope},
        409: {"model": ErrorEnvelope},
        503: {"model": ErrorEnvelope},
    },
)
async def delete_graph(graph_id: str, graph_service: GraphServiceDep) -> Response:
    """Delete a user-created graph. The builtin graph can never be deleted;
    past sessions and reports are the learning record and stay untouched."""
    if not graph_service.is_deletable(graph_id):
        raise ApiError(
            409, ErrorCode.GRAPH_NOT_DELETABLE, "The builtin graph cannot be deleted."
        )
    deleted = await graph_service.delete_graph(graph_id)
    if not deleted:
        raise ApiError(404, ErrorCode.GRAPH_NOT_FOUND, "No such knowledge graph.")
    return Response(status_code=204)
