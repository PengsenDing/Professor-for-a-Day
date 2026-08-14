import os
from collections.abc import AsyncIterator

import pytest

# Settings are validated at import time, so these must exist before the app loads.
os.environ.setdefault("DEUTSCHLANDGPT_API_KEY", "test-key")
os.environ.setdefault("DEUTSCHLANDGPT_MODEL", "test-model")
# Never touch the development database, and fail fast when no server is running.
os.environ.setdefault("MONGODB_DATABASE", "professor_for_a_day_test")
os.environ.setdefault("MONGODB_TIMEOUT_MS", "500")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
async def mongo_database() -> AsyncIterator:
    """A real database handle, skipping the test when no MongoDB is reachable.

    Start one with: docker compose -f infrastructure/docker-compose.yml up -d
    """
    from app.config import get_settings
    from app.db import MongoConnection
    from app.repositories.conversations import COLLECTION_NAME

    settings = get_settings()
    mongo = MongoConnection(settings)

    if not await mongo.ping():
        await mongo.close()
        pytest.skip(f"No MongoDB at {settings.mongodb_uri.split('@')[-1]}")

    try:
        yield mongo.database
    finally:
        await mongo.database.drop_collection(COLLECTION_NAME)
        await mongo.close()
