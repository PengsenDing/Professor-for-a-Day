"""Shared FastAPI dependencies.

Every adapter behind the session routes is a dependency, so tests can swap in
fakes via `dependency_overrides` without patching internals.
"""

from typing import Annotated

from fastapi import Depends, Request

from .config import get_settings
from .curriculum import load_catalog
from .curriculum.rubrics import load_rubrics
from .db import MongoConnection
from .errors import ApiError
from .repositories.sessions import SessionRepository
from .schemas import ErrorCode
from .services.judge import JudgeAdapter
from .services.orchestrator import SessionOrchestrator
from .services.student import StudentAdapter


def get_mongo(request: Request) -> MongoConnection:
    mongo: MongoConnection | None = getattr(request.app.state, "mongo", None)
    if mongo is None:
        raise ApiError(503, ErrorCode.DB_UNAVAILABLE, "The database is not available.")
    return mongo


def get_session_repository(
    mongo: Annotated[MongoConnection, Depends(get_mongo)],
) -> SessionRepository:
    return SessionRepository(mongo.database)


def get_judge() -> JudgeAdapter:
    return JudgeAdapter()


def get_student() -> StudentAdapter:
    return StudentAdapter()


def get_orchestrator(
    repository: Annotated[SessionRepository, Depends(get_session_repository)],
    judge: Annotated[JudgeAdapter, Depends(get_judge)],
    student: Annotated[StudentAdapter, Depends(get_student)],
) -> SessionOrchestrator:
    return SessionOrchestrator(
        repository=repository,
        judge=judge,
        student=student,
        rubrics=load_rubrics(),
        catalog=load_catalog(),
        max_learner_turns=get_settings().session_max_learner_turns,
    )


OrchestratorDep = Annotated[SessionOrchestrator, Depends(get_orchestrator)]
