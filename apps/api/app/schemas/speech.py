"""Speech contract schemas."""

from pydantic import BaseModel


class Transcription(BaseModel):
    transcript: str
