"""ElevenLabs speech adapter (AC-STT / AC-TTS).

One provider-neutral interface for speech-to-text and text-to-speech. Audio is
transient in both directions: uploads are transcribed and discarded, synthesized
audio is streamed back and never persisted (ADR-0003, AC-SEC-4).
"""

import logging
from functools import lru_cache

from elevenlabs.client import AsyncElevenLabs
from elevenlabs.types import SpeechToTextChunkResponseModel

from ..config import Settings, get_settings
from .exceptions import SpeechSynthesisError, TranscriptionError

logger = logging.getLogger(__name__)


class SpeechService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = AsyncElevenLabs(
            api_key=settings.elevenlabs_api_key.get_secret_value(),
            timeout=settings.elevenlabs_timeout_seconds,
        )

    async def transcribe(self, audio: bytes) -> str:
        try:
            result = await self._client.speech_to_text.convert(
                file=audio,
                model_id=self._settings.elevenlabs_stt_model,
                # English-only MVP: pin the language so scribe's auto-detect
                # can't transcribe accented/short clips as another language.
                language_code="en",
            )
        except Exception as error:  # noqa: BLE001 - upstream detail stays in the log
            logger.exception("Transcription failed upstream")
            raise TranscriptionError("Transcription failed") from error
        # Without webhook/multichannel options the API returns the plain chunk
        # model; the other union members would mean a contract change upstream.
        if not isinstance(result, SpeechToTextChunkResponseModel):
            logger.error("Unexpected transcription response type: %s", type(result).__name__)
            raise TranscriptionError("Transcription failed")
        return result.text

    async def synthesize(self, text: str, mode: str | None = None) -> bytes:
        try:
            stream = self._client.text_to_speech.convert(
                voice_id=self._settings.voice_id_for_mode(mode),
                model_id=self._settings.elevenlabs_tts_model,
                text=text,
                output_format="mp3_44100_128",
            )
            return b"".join([chunk async for chunk in stream])
        except Exception as error:  # noqa: BLE001 - upstream detail stays in the log
            logger.exception("Speech synthesis failed upstream")
            raise SpeechSynthesisError("Speech synthesis failed") from error


@lru_cache
def get_speech_service() -> SpeechService:
    return SpeechService(get_settings())
