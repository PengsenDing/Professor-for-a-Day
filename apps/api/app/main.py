"""FastAPI application entrypoint.

Run with:  uvicorn app.main:app --reload --port 8787
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import chat, health


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="Professor-for-a-Day API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    app.include_router(health.router)
    app.include_router(chat.router, prefix="/api")

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
