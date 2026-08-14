"""Conversation CRUD. Persistence only — the LLM is not called from here."""

from fastapi import APIRouter, HTTPException, Query, status

from ..dependencies import ConversationRepositoryDep
from ..models import Conversation
from ..schemas import AppendMessagesRequest, CreateConversationRequest

router = APIRouter(tags=["conversations"])

NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
)


@router.post("/conversations", response_model=Conversation, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: CreateConversationRequest,
    repository: ConversationRepositoryDep,
) -> Conversation:
    return await repository.create(title=body.title)


@router.get("/conversations", response_model=list[Conversation])
async def list_conversations(
    repository: ConversationRepositoryDep,
    limit: int = Query(default=20, ge=1, le=100),
) -> list[Conversation]:
    return await repository.list_recent(limit=limit)


@router.get("/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(
    conversation_id: str,
    repository: ConversationRepositoryDep,
) -> Conversation:
    conversation = await repository.get(conversation_id)
    if conversation is None:
        raise NOT_FOUND
    return conversation


@router.post("/conversations/{conversation_id}/messages", response_model=Conversation)
async def append_messages(
    conversation_id: str,
    body: AppendMessagesRequest,
    repository: ConversationRepositoryDep,
) -> Conversation:
    conversation = await repository.append_messages(conversation_id, body.messages)
    if conversation is None:
        raise NOT_FOUND
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    repository: ConversationRepositoryDep,
) -> None:
    if not await repository.delete(conversation_id):
        raise NOT_FOUND
