"""Error envelope, mirroring `ErrorCode`/`Error`/`ErrorEnvelope` in the contract."""

from enum import StrEnum

from pydantic import BaseModel, Field


class ErrorCode(StrEnum):
    INVALID_CONCEPT = "INVALID_CONCEPT"
    INVALID_MODE = "INVALID_MODE"
    EMPTY_SUBMISSION = "EMPTY_SUBMISSION"
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
    TURN_NOT_FOUND = "TURN_NOT_FOUND"
    SESSION_ENDED = "SESSION_ENDED"
    TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED"
    GENERATION_FAILED = "GENERATION_FAILED"
    SPEECH_FAILED = "SPEECH_FAILED"
    UPLOAD_TOO_LARGE = "UPLOAD_TOO_LARGE"
    UNSUPPORTED_AUDIO_TYPE = "UNSUPPORTED_AUDIO_TYPE"
    DB_UNAVAILABLE = "DB_UNAVAILABLE"
    VALIDATION_FAILED = "VALIDATION_FAILED"


class Error(BaseModel):
    code: ErrorCode
    message: str = Field(
        description=(
            "Human-readable, provider-neutral. Never names a vendor, model, "
            "upstream status, or upstream error text."
        )
    )


class ErrorEnvelope(BaseModel):
    error: Error
