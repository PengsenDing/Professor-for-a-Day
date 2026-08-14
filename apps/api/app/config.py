"""Server configuration. Secrets live only in the environment, never in code."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed settings, loaded from `apps/api/.env` when present."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deutschlandgpt_api_key: SecretStr
    deutschlandgpt_model: str = "gemini-2.5-pro"
    deutschlandgpt_base_url: str = "https://apiv2.deutschlandgpt.de/platform-api/api/v2"

    port: int = 8787
    web_origin: str = "http://localhost:5173"

    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    llm_timeout_seconds: float = Field(default=60.0, gt=0.0)


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings, validated on first access.

    Raises `pydantic.ValidationError` if `DEUTSCHLANDGPT_API_KEY` is missing, so a
    misconfigured server fails at startup instead of on the first request.
    """
    return Settings()
