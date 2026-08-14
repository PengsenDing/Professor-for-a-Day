"""FastAPI application entrypoint.

Run with:  uvicorn app.main:app --reload --port 8787
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from pymongo.errors import PyMongoError

from .config import get_settings
from .db import MongoConnection
from .errors import register_error_handlers
from .repositories.sessions import SessionRepository
from .routes import curriculum, health, sessions, speech

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the Mongo client once.

    A missing database does not block startup: /health reports `database: "down"`
    and the session routes answer 503, so frontend work is not gated on Mongo.
    """
    settings = get_settings()
    mongo = MongoConnection(settings)
    app.state.mongo = mongo

    if await mongo.ping():
        try:
            await SessionRepository(mongo.database).ensure_indexes()
        except PyMongoError:
            # A read-only user or a mid-election replica set should not take the API down.
            logger.exception("MongoDB index creation failed; continuing without it")
        logger.info("MongoDB connected (database=%s)", settings.mongodb_database)
    else:
        logger.warning(
            "Starting without a reachable MongoDB (database=%s); "
            "session routes will answer 503",
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

    app = FastAPI(title="Professor-for-a-Day Product API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    register_error_handlers(app)

    app.include_router(health.router)
    app.include_router(curriculum.router)
    app.include_router(sessions.router)
    app.include_router(speech.router)

    _install_contract_openapi(app)

    return app


def _install_contract_openapi(app: FastAPI) -> None:
    """Serve an /openapi.json that matches the contract (ADR-0001).

    FastAPI injects a `422 HTTPValidationError` response into every operation with
    parameters or a body. The contract declares 422 (as `ErrorEnvelope`) only where
    it applies, so the auto-injected ones are pruned.
    """

    def contract_openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
        )

        for path_item in schema.get("paths", {}).values():
            for operation in path_item.values():
                responses = operation.get("responses", {})
                auto_422 = responses.get("422", {})
                if "HTTPValidationError" in str(auto_422):
                    del responses["422"]

        components = schema.get("components", {}).get("schemas", {})
        components.pop("HTTPValidationError", None)
        components.pop("ValidationError", None)

        app.openapi_schema = schema
        return schema

    app.openapi = contract_openapi  # type: ignore[method-assign]


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
