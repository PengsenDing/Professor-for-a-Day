import os

import pytest

# Settings are validated at import time, so the key must exist before the app loads.
os.environ.setdefault("DEUTSCHLANDGPT_API_KEY", "test-key")
os.environ.setdefault("DEUTSCHLANDGPT_MODEL", "test-model")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
