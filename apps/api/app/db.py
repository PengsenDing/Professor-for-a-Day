"""MongoDB connection lifecycle.

One client per process, opened in the app lifespan and stored on `app.state`.
Repositories receive a database handle instead of building their own connection,
so nothing above this module owns a socket — see docs/architecture.md.
"""

import logging
from typing import Any

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

from .config import Settings

logger = logging.getLogger(__name__)


class MongoConnection:
    """Owns the driver client. The URI may contain credentials, so it is never logged."""

    def __init__(self, settings: Settings) -> None:
        self._client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=settings.mongodb_timeout_ms,
            tz_aware=True,
        )
        self._database_name = settings.mongodb_database

    @property
    def database(self) -> AsyncDatabase[dict[str, Any]]:
        return self._client[self._database_name]

    async def ping(self) -> bool:
        """Report reachability without raising, so /health can degrade instead of erroring."""
        try:
            await self._client.admin.command("ping")
        except PyMongoError as error:
            logger.warning("MongoDB ping failed (database=%s): %s", self._database_name, error)
            return False
        return True

    async def close(self) -> None:
        await self._client.close()
