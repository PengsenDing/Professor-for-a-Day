"""FastAPI application entrypoint.

Run with:  uvicorn app.main:app --reload --port 8787
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from .config import get_settings
from .db import MongoConnection
from .repositories.conversations import ConversationRepository
from .routes import chat, conversations, health

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the Mongo client once, and index on the way up.

    A missing database does not block startup: the LLM routes stay usable and
    /health reports `database: "down"`, so frontend work is not gated on Mongo.
    """
    settings = get_settings()
    mongo = MongoConnection(settings)
    app.state.mongo = mongo

    if await mongo.ping():
        try:
            await ConversationRepository(mongo.database).ensure_indexes()
        except PyMongoError:
            # A read-only user or a mid-election replica set should not take the API down.
            logger.exception("MongoDB index creation failed; continuing without it")
        logger.info("MongoDB connected (database=%s)", settings.mongodb_database)
    else:
        logger.warning(
            "Starting without a reachable MongoDB (database=%s); "
            "conversation routes will answer 503",
            settings.mongodb_database,
        )

    try:
        yield
    finally:
        await mongo.close()


def create_app() -> FastAPI:
    settings = get_settings()

    # uvicorn only configures its own loggers, so without this the application's
    # own INFO lines (including whether MongoDB connected) never reach the console.
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )

    app = FastAPI(title="Professor-for-a-Day API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(PyMongoError)
    async def handle_database_error(request: Request, exc: PyMongoError) -> JSONResponse:
        # Driver errors can name hosts and credentials, so they stay in the log.
        logger.exception("MongoDB operation failed for %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "The database is not available."},
        )

    app.include_router(health.router)
    app.include_router(chat.router, prefix="/api")
    app.include_router(conversations.router, prefix="/api")

    return app


app = create_app()


def main() -> None:
    """Local dev server, so `python -m app.main` works without remembering flags."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.port,
        reload=True,
    )


if __name__ == "__main__":
    main()
