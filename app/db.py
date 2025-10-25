from collections.abc import AsyncIterator

import psycopg
from psycopg import OperationalError
from psycopg_pool import AsyncConnectionPool

from infrastructure.logger import get_logger

from .config import get_settings

logger = get_logger()

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


async def _reset_pool(bad_pool: AsyncConnectionPool | None) -> None:
    """Close and clear the cached pool so the next call recreates it."""
    global _pool
    if bad_pool is None:
        return
    try:
        await bad_pool.close()
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("Error closing connection pool after failure: %s", exc)
    finally:
        _pool = None


async def get_conn() -> AsyncIterator[psycopg.AsyncConnection]:
    """Yield an async connection from the pool with a transaction.

    Handles closed/invalid pooled connections by recreating the pool once.
    """
    attempt = 0
    last_error: OperationalError | None = None

    while attempt < 2:
        pool = init_pool()
        try:
            async with pool.connection() as conn, conn.transaction():
                yield conn
            return
        except OperationalError as exc:
            attempt += 1
            last_error = exc
            logger.warning(
                "Database connection error (attempt %s/2): %s", attempt, exc
            )
            await _reset_pool(pool)
        except Exception:
            # Propagate non-connection errors immediately
            raise

    # Only reached if both attempts failed with OperationalError
    assert last_error is not None
    raise last_error
