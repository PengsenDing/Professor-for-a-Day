"""Error envelope machinery.

Every domain or provider error crosses the HTTP boundary as
`{"error": {"code": <ErrorCode>, "message": <provider-neutral text>}}` (contract §3.5).
Routes and services raise `ApiError`; the handlers registered here do the shaping.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from .schemas import ErrorCode

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """A contract error: maps to one status code and one `ErrorCode`."""

    def __init__(self, status_code: int, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_response(status_code: int, code: ErrorCode, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code.value, "message": message}},
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            _validation_code(exc),
            "The request is invalid.",
        )

    @app.exception_handler(PyMongoError)
    async def handle_database_error(request: Request, exc: PyMongoError) -> JSONResponse:
        # Driver errors can name hosts and credentials, so they stay in the log.
        logger.exception("MongoDB operation failed for %s %s", request.method, request.url.path)
        return error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCode.DB_UNAVAILABLE,
            "The database is not available.",
        )


def _validation_code(exc: RequestValidationError) -> ErrorCode:
    """Map a request-validation failure onto the contract's specific codes."""
    fields = {error["loc"][-1] for error in exc.errors() if error.get("loc")}
    if "mode" in fields:
        return ErrorCode.INVALID_MODE
    if "graph_id" in fields:
        return ErrorCode.INVALID_GRAPH
    if "concept_id" in fields:
        return ErrorCode.INVALID_CONCEPT
    if "learner_text" in fields:
        return ErrorCode.EMPTY_SUBMISSION
    return ErrorCode.VALIDATION_FAILED
