from app.db import MongoConnection
from app.main import app
from app.routes import chat as chat_route


def _fake_ping(reachable: bool):
    async def ping(self) -> bool:
        return reachable

    return ping


def test_health_reports_database_up(client, monkeypatch):
    monkeypatch.setattr(MongoConnection, "ping", _fake_ping(True))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "model": "test-model", "database": "up"}


def test_health_reports_database_down(client, monkeypatch):
    monkeypatch.setattr(MongoConnection, "ping", _fake_ping(False))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["database"] == "down"
    # The process is still healthy even when Mongo is not.
    assert response.json()["ok"] is True


def test_conversation_routes_are_503_without_a_connection(client, monkeypatch):
    monkeypatch.delattr(app.state, "mongo", raising=False)

    response = client.get("/api/conversations")

    assert response.status_code == 503
    assert response.json() == {"detail": "The database is not available."}


def test_chat_returns_reply(client, monkeypatch):
    async def fake_generate_reply(messages, model=None):
        assert [message.content for message in messages] == ["Hallo"]
        return f"reply from {model}"

    monkeypatch.setattr(chat_route, "generate_reply", fake_generate_reply)

    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hallo"}]})

    assert response.status_code == 200
    assert response.json() == {"reply": "reply from test-model", "model": "test-model"}


def test_chat_rejects_empty_messages(client):
    response = client.post("/api/chat", json={"messages": []})

    assert response.status_code == 422


def test_chat_maps_provider_failure_to_502(client, monkeypatch):
    async def failing_generate_reply(messages, model=None):
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(chat_route, "generate_reply", failing_generate_reply)

    response = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Hallo"}]})

    assert response.status_code == 502
    assert "upstream exploded" not in response.text
