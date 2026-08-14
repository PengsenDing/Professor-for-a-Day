import os
from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest

# Settings are validated at import time, so these must exist before the app loads.
os.environ.setdefault("DEUTSCHLANDGPT_API_KEY", "test-key")
os.environ.setdefault("DEUTSCHLANDGPT_MODEL", "test-model")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-key")
# Never touch the development database, and fail fast when no server is running.
os.environ.setdefault("MONGODB_DATABASE", "professor_for_a_day_test")
os.environ.setdefault("MONGODB_TIMEOUT_MS", "200")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def harness():
    """The app with every provider and the repository replaced by fakes (AC §5)."""
    from fastapi.testclient import TestClient

    from app import dependencies
    from app.main import app
    from app.services import speech as speech_module
    from tests.fakes import FakeJudge, FakeSessionRepository, FakeSpeechService, FakeStudent

    call_log: list[str] = []
    repository = FakeSessionRepository()
    judge = FakeJudge(call_log)
    student = FakeStudent(call_log)
    speech = FakeSpeechService()

    app.dependency_overrides[dependencies.get_session_repository] = lambda: repository
    app.dependency_overrides[dependencies.get_judge] = lambda: judge
    app.dependency_overrides[dependencies.get_student] = lambda: student
    app.dependency_overrides[speech_module.get_speech_service] = lambda: speech

    try:
        with TestClient(app) as test_client:
            yield SimpleNamespace(
                client=test_client,
                repository=repository,
                judge=judge,
                student=student,
                speech=speech,
                call_log=call_log,
            )
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
async def mongo_database() -> AsyncIterator:
    """A real database handle, skipping the test when no MongoDB is reachable.

    Start one with: docker compose -f infrastructure/docker-compose.yml up -d
    """
    from app.config import get_settings
    from app.db import MongoConnection
    from app.repositories.sessions import COLLECTION_NAME

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
