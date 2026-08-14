"""Server configuration. Secrets live only in the environment, never in code."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchored to this file, not the working directory, so `uvicorn app.main:app`
# finds apps/api/.env no matter where it is launched from.
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    """Environment-backed settings, loaded from `apps/api/.env` when present."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deutschlandgpt_api_key: SecretStr
    deutschlandgpt_model: str = "gemini-2.5-pro"
    deutschlandgpt_base_url: str = "https://apiv2.deutschlandgpt.de/platform-api/api/v2"

    # ElevenLabs speech provider. A missing key fails startup (AC-CFG-2); the voice is
    # fixed server-side and no request parameter can select another one (AC-CFG-5).
    elevenlabs_api_key: SecretStr
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_stt_model: str = "scribe_v1"
    elevenlabs_tts_model: str = "eleven_multilingual_v2"
    elevenlabs_timeout_seconds: float = Field(default=30.0, gt=0.0)

    session_max_learner_turns: int = Field(default=8, gt=0)
    transcription_max_bytes: int = Field(default=15_000_000, gt=0)

    port: int = 8787
    web_origin: str = "http://localhost:5173"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "professor_for_a_day"
    mongodb_timeout_ms: int = Field(default=5_000, gt=0)

    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=60.0, gt=0.0)

    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings, validated on first access.

    Raises `pydantic.ValidationError` if `DEUTSCHLANDGPT_API_KEY` is missing, so a
    misconfigured server fails at startup instead of on the first request.
    """
    # The required fields come from the environment/.env at runtime, which the
    # static checker cannot see.
    return Settings()  # pyright: ignore[reportCallIssue]
