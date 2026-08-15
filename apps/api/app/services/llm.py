"""LangChain LLM provider for DeutschlandGPT.

DeutschlandGPT exposes an OpenAI-compatible `/chat/completions` endpoint, so
`ChatOpenAI` can talk to it by overriding `base_url`. Everything above this module
depends on LangChain runnables, not on the vendor, which keeps the provider
swappable later.
"""

from functools import lru_cache

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from ..config import get_settings


def resolve_model(requested: str | None = None) -> str:
    """Return the model to use for a request, falling back to the configured default."""
    return requested or get_settings().deutschlandgpt_model


@lru_cache
def get_chat_model(model: str) -> BaseChatModel:
    """Build (and cache) a chat model bound to DeutschlandGPT."""
    settings = get_settings()
    return ChatOpenAI(
        model=model,
        api_key=settings.deutschlandgpt_api_key,
        base_url=settings.deutschlandgpt_base_url,
        temperature=settings.llm_temperature,
        timeout=settings.llm_timeout_seconds,
    )


@lru_cache
def get_role_chat_model(model: str, temperature: float) -> BaseChatModel:
    """A chat model with a role-specific temperature (Judge cold, AI Student warm)."""
    settings = get_settings()
    return ChatOpenAI(
        model=model,
        api_key=settings.deutschlandgpt_api_key,
        base_url=settings.deutschlandgpt_base_url,
        temperature=temperature,
        timeout=settings.llm_timeout_seconds,
    )
