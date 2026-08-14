"""Chat endpoint: validates the request, delegates to the LLM service."""

import logging

from fastapi import APIRouter, HTTPException, status

from ..schemas import ChatRequest, ChatResponse
from ..services.llm import generate_reply, resolve_model

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    model = resolve_model(request.model)

    try:
        reply = await generate_reply(request.messages, model=model)
    except Exception:
        # Upstream errors may carry the API key or prompt content, so log them
        # server-side and return a generic message to the browser.
        logger.exception("DeutschlandGPT request failed (model=%s)", model)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The language model provider could not be reached.",
        ) from None

    return ChatResponse(reply=reply, model=model)
