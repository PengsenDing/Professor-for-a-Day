"""Speech-to-text route (`transcribeAudio`).

Pure transcription: touches no session, invokes no Judge or AI Student, and
discards the upload after responding (AC-STT-2/5). Size and content-type are
rejected before any provider call (AC-STT-3).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile

from ..config import get_settings
from ..errors import ApiError
from ..schemas import ErrorCode, ErrorEnvelope, Transcription
from ..services.exceptions import TranscriptionError
from ..services.speech import SpeechService, get_speech_service

router = APIRouter(tags=["speech"])

ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/flac",
    "video/webm",
}


@router.post(
    "/api/speech/transcriptions",
    operation_id="transcribeAudio",
    response_model=Transcription,
    responses={
        413: {"model": ErrorEnvelope},
        415: {"model": ErrorEnvelope},
        502: {"model": ErrorEnvelope},
    },
)
async def transcribe_audio(
    audio: Annotated[UploadFile, File(description="The recorded learner audio.")],
    speech: Annotated[SpeechService, Depends(get_speech_service)],
) -> Transcription:
    """Transcribe learner audio to text."""
    max_bytes = get_settings().transcription_max_bytes

    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise ApiError(
            415, ErrorCode.UNSUPPORTED_AUDIO_TYPE, "This audio format is not supported."
        )
    if audio.size is not None and audio.size > max_bytes:
        raise ApiError(
            413, ErrorCode.UPLOAD_TOO_LARGE, "The audio upload exceeds the size limit."
        )

    data = await audio.read()
    if len(data) > max_bytes:
        raise ApiError(
            413, ErrorCode.UPLOAD_TOO_LARGE, "The audio upload exceeds the size limit."
        )

    try:
        transcript = await speech.transcribe(data)
    except TranscriptionError as error:
        raise ApiError(
            502,
            ErrorCode.TRANSCRIPTION_FAILED,
            "Transcription is temporarily unavailable. You can type your explanation instead.",
        ) from error
    return Transcription(transcript=transcript)
