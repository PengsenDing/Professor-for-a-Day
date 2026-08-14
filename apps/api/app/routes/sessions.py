"""Teaching Session routes (`startSession`, `submitTurn`, `getTurnSpeech`, `finishSession`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response

from ..dependencies import OrchestratorDep
from ..errors import ApiError
from ..schemas import (
    ErrorCode,
    ErrorEnvelope,
    SessionCreated,
    SessionFinished,
    StartSessionRequest,
    SubmitTurnRequest,
    TurnEnvelope,
)
from ..services.exceptions import SpeechSynthesisError
from ..services.speech import SpeechService, get_speech_service

router = APIRouter(tags=["sessions"])

SessionId = Annotated[
    str,
    Path(min_length=1, description="The anonymous Teaching Session identifier."),
]
TurnNumber = Annotated[
    int,
    Path(
        ge=0,
        description="The AI Student reply to synthesize. `0` is the opening question.",
    ),
]


@router.post(
    "/api/sessions",
    operation_id="startSession",
    response_model=SessionCreated,
    status_code=201,
    responses={
        422: {"model": ErrorEnvelope},
        502: {"model": ErrorEnvelope},
        503: {"model": ErrorEnvelope},
    },
)
async def start_session(body: StartSessionRequest, orchestrator: OrchestratorDep) -> SessionCreated:
    """Start a Teaching Session."""
    return await orchestrator.start(body)


@router.post(
    "/api/sessions/{session_id}/turns",
    operation_id="submitTurn",
    response_model=TurnEnvelope,
    responses={
        404: {"model": ErrorEnvelope},
        409: {"model": ErrorEnvelope},
        422: {"model": ErrorEnvelope},
        502: {"model": ErrorEnvelope},
        503: {"model": ErrorEnvelope},
    },
)
async def submit_turn(
    session_id: SessionId, body: SubmitTurnRequest, orchestrator: OrchestratorDep
) -> TurnEnvelope:
    """Submit a learner explanation (one Teaching Turn)."""
    return await orchestrator.submit_turn(session_id, body)


@router.get(
    "/api/sessions/{session_id}/turns/{turn_number}/speech",
    operation_id="getTurnSpeech",
    response_class=Response,
    responses={
        200: {
            "description": "Synthesized speech audio.",
            "content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}},
        },
        404: {"model": ErrorEnvelope},
        502: {"model": ErrorEnvelope},
        503: {"model": ErrorEnvelope},
    },
)
async def get_turn_speech(
    session_id: SessionId,
    turn_number: TurnNumber,
    orchestrator: OrchestratorDep,
    speech: Annotated[SpeechService, Depends(get_speech_service)],
) -> Response:
    """Synthesize speech for one AI Student reply (ADR-0003: on fetch, never cached)."""
    student_text = await orchestrator.student_text_for_turn(session_id, turn_number)
    try:
        audio = await speech.synthesize(student_text)
    except SpeechSynthesisError as error:
        raise ApiError(
            502, ErrorCode.SPEECH_FAILED, "Speech synthesis is temporarily unavailable."
        ) from error
    return Response(content=audio, media_type="audio/mpeg")


@router.post(
    "/api/sessions/{session_id}/finish",
    operation_id="finishSession",
    response_model=SessionFinished,
    responses={
        404: {"model": ErrorEnvelope},
        502: {"model": ErrorEnvelope},
        503: {"model": ErrorEnvelope},
    },
)
async def finish_session(session_id: SessionId, orchestrator: OrchestratorDep) -> SessionFinished:
    """Finish a Teaching Session early (idempotent)."""
    return await orchestrator.finish(session_id)
