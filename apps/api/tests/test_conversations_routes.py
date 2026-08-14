"""Route tests with the repository faked, so they never need a database."""

import pytest

from app.dependencies import get_conversation_repository
from app.main import app
from app.models import Conversation, StoredMessage, utcnow


class FakeConversationRepository:
    """In-memory stand-in with the same surface as ConversationRepository."""

    def __init__(self) -> None:
        self._store: dict[str, Conversation] = {}
        self._counter = 0

    async def create(self, title: str | None = None) -> Conversation:
        self._counter += 1
        now = utcnow()
        conversation = Conversation(
            id=f"{self._counter:024d}", title=title, messages=[], created_at=now, updated_at=now
        )
        self._store[conversation.id] = conversation
        return conversation

    async def get(self, conversation_id: str) -> Conversation | None:
        return self._store.get(conversation_id)

    async def append_messages(self, conversation_id, messages) -> Conversation | None:
        conversation = self._store.get(conversation_id)
        if conversation is None:
            return None

        now = utcnow()
        conversation.messages.extend(
            StoredMessage(role=message.role, content=message.content, created_at=now)
            for message in messages
        )
        conversation.updated_at = now
        return conversation

    async def list_recent(self, limit: int = 20) -> list[Conversation]:
        ordered = sorted(self._store.values(), key=lambda item: item.updated_at, reverse=True)
        return ordered[:limit]

    async def delete(self, conversation_id: str) -> bool:
        return self._store.pop(conversation_id, None) is not None


@pytest.fixture
def repository() -> FakeConversationRepository:
    return FakeConversationRepository()


@pytest.fixture
def client(repository):
    from fastapi.testclient import TestClient

    app.dependency_overrides[get_conversation_repository] = lambda: repository
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def test_create_conversation(client):
    response = client.post("/api/conversations", json={"title": "Thermodynamik"})

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Thermodynamik"
    assert body["messages"] == []
    assert body["id"]


def test_create_conversation_without_title(client):
    response = client.post("/api/conversations", json={})

    assert response.status_code == 201
    assert response.json()["title"] is None


def test_append_messages_then_read_back(client):
    conversation_id = client.post("/api/conversations", json={}).json()["id"]

    appended = client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"messages": [{"role": "user", "content": "Erklär mir Entropie."}]},
    )
    assert appended.status_code == 200

    fetched = client.get(f"/api/conversations/{conversation_id}").json()
    assert [message["content"] for message in fetched["messages"]] == ["Erklär mir Entropie."]
    assert fetched["messages"][0]["created_at"]


def test_list_conversations_is_newest_first(client):
    first = client.post("/api/conversations", json={"title": "one"}).json()["id"]
    client.post("/api/conversations", json={"title": "two"})
    client.post(
        f"/api/conversations/{first}/messages",
        json={"messages": [{"role": "user", "content": "touch"}]},
    )

    listed = client.get("/api/conversations").json()

    assert listed[0]["id"] == first
    assert len(listed) == 2


def test_list_conversations_rejects_out_of_range_limit(client):
    assert client.get("/api/conversations", params={"limit": 0}).status_code == 422
    assert client.get("/api/conversations", params={"limit": 500}).status_code == 422


def test_delete_conversation(client):
    conversation_id = client.post("/api/conversations", json={}).json()["id"]

    assert client.delete(f"/api/conversations/{conversation_id}").status_code == 204
    assert client.get(f"/api/conversations/{conversation_id}").status_code == 404


def test_unknown_conversation_is_404(client):
    missing = "0" * 24

    assert client.get(f"/api/conversations/{missing}").status_code == 404
    assert client.delete(f"/api/conversations/{missing}").status_code == 404
    assert (
        client.post(
            f"/api/conversations/{missing}/messages",
            json={"messages": [{"role": "user", "content": "x"}]},
        ).status_code
        == 404
    )


def test_append_messages_rejects_empty_list(client):
    conversation_id = client.post("/api/conversations", json={}).json()["id"]

    response = client.post(
        f"/api/conversations/{conversation_id}/messages", json={"messages": []}
    )

    assert response.status_code == 422
