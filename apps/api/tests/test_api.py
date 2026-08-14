from app.routes import chat as chat_route


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "model": "test-model"}


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
