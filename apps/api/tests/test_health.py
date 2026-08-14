"""AC-REG-1 / AC-OBS-3: /health reports process and database status."""


def test_health_reports_ok_and_database_state(client) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["model"], str) and body["model"]
    assert body["database"] in {"up", "down"}
