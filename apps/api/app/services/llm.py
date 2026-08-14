"""LangChain LLM provider for DeutschlandGPT.

DeutschlandGPT exposes an OpenAI-compatible `/chat/completions` endpoint, so
`ChatOpenAI` can talk to it by overriding `base_url`. Everything above this module
depends on LangChain runnables, not on the vendor, which keeps the provider
swappable later.
"""

from functools import lru_cache

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable
from langchain_openai import ChatOpenAI

from ..config import get_settings
from ..schemas import ChatMessage

TEACHING_SYSTEM_PROMPT = (
    "You are the teaching assistant of Professor-for-a-Day. "
    "Explain concepts step by step, stay factual, and say so when you are unsure. "
    "Answer in the language the student used."
)

_MESSAGE_TYPES: dict[str, type[BaseMessage]] = {
    "system": SystemMessage,
    "user": HumanMessage,
    "assistant": AIMessage,
}


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


def build_chat_chain(model: str) -> Runnable:
    """Prompt -> model -> plain text.

    This is the seam where retrieval, tools and memory get added later; the route
    layer only needs to know it can `ainvoke` the result.
    """
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", TEACHING_SYSTEM_PROMPT),
            MessagesPlaceholder("messages"),
        ]
    )
    return prompt | get_chat_model(model) | StrOutputParser()


def to_langchain_messages(messages: list[ChatMessage]) -> list[BaseMessage]:
    return [_MESSAGE_TYPES[message.role](content=message.content) for message in messages]


async def generate_reply(messages: list[ChatMessage], model: str | None = None) -> str:
    """Run one turn of the teaching conversation and return the assistant text."""
    chain = build_chat_chain(resolve_model(model))
    return await chain.ainvoke({"messages": to_langchain_messages(messages)})
