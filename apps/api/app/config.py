"""Server configuration. Secrets live only in the environment, never in code."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# The effort values DeutschlandGPT's OpenAI-compatible endpoint accepts for
# gpt-5-family models; invalid values are rejected upstream with a 400.
ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh"]

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

    # ElevenLabs speech provider. A missing key fails startup (AC-CFG-2); voices are
    # fixed server-side per AI Student mode and no request parameter can select one
    # (AC-CFG-5) — the session's mode picks the character. Defaults are ElevenLabs
    # premade voices; `elevenlabs_voice_id` is the fallback for unknown modes.
    elevenlabs_api_key: SecretStr
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel
    elevenlabs_voice_id_beginner: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel: warm, curious
    elevenlabs_voice_id_confident: str = "pNInz6obpgDQGcFmaJgB"  # Adam: assertive
    elevenlabs_voice_id_skeptic: str = "onwK4e9ZLuTAKqWW03F9"  # Daniel: measured, probing
    elevenlabs_stt_model: str = "scribe_v1"
    elevenlabs_tts_model: str = "eleven_multilingual_v2"
    elevenlabs_timeout_seconds: float = Field(default=30.0, gt=0.0)

    def voice_id_for_mode(self, mode: str | None) -> str:
        """The ElevenLabs voice for one AI Student mode, falling back to the default."""
        return {
            "beginner": self.elevenlabs_voice_id_beginner,
            "confident": self.elevenlabs_voice_id_confident,
            "skeptic": self.elevenlabs_voice_id_skeptic,
        }.get(mode or "", self.elevenlabs_voice_id)

    transcription_max_bytes: int = Field(default=15_000_000, gt=0)

    port: int = 8787
    web_origin: str = "http://localhost:3000"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "professor_for_a_day"
    mongodb_timeout_ms: int = Field(default=5_000, gt=0)

    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=60.0, gt=0.0)

    # The Judge classifies against closed id sets, so it runs cold; the AI Student
    # only phrases a directive it is handed, so some sampling variety is safe.
    judge_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    student_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Reasoning depth per role: the Judge weighs cumulative evidence against the
    # rubric, so it gets room to think; the Student only phrases a directive it is
    # handed, so shallow reasoning keeps replies fast and cheap.
    judge_reasoning_effort: ReasoningEffort = "medium"
    student_reasoning_effort: ReasoningEffort = "low"

    # The hint coach nudges the learner toward a better explanation. It sees only
    # learner-visible conversation text (never the rubric or Judge output), phrases
    # one short suggestion, and needs no depth — warm and shallow like the Student.
    hint_temperature: float = Field(default=0.5, ge=0.0, le=2.0)
    hint_reasoning_effort: ReasoningEffort = "low"

    # Knowledge-graph generation (ADR-0005): rubric authoring and session-end
    # graph summarization share one temperature/effort pair — both produce
    # structured teaching material, warmer than the Judge but cooler than the
    # Student's conversational voice.
    graph_temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    graph_reasoning_effort: ReasoningEffort = "medium"
    graph_max_new_concepts_per_session: int = Field(default=8, gt=0)

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
