from collections.abc import AsyncIterator

import psycopg
from psycopg_pool import AsyncConnectionPool

from .config import get_settings

_pool: AsyncConnectionPool | None = None


def init_pool() -> AsyncConnectionPool:
    """Initialize a global async connection pool.

    Returns:
    A configured `AsyncConnectionPool`.
    """
    global _pool
    if _pool is None:
        dsn = get_settings().database_url
        _pool = AsyncConnectionPool(
            conninfo=dsn,
            min_size=1,
            max_size=10,
            kwargs={"autocommit": False},
        )
    return _pool

async def get_conn() -> AsyncIterator[psycopg.AsyncConnection]:
    """Yield an async connection from the pool with a transaction.

    Ensures rollback on error and commit on success.
    """
    pool = init_pool()
    async with pool.connection() as conn:  
        async with conn.transaction():
            yield conn