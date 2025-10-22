from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterable
from contextlib import asynccontextmanager
from typing import Any

import pytest


class FakeAsyncCursor:
    """Lightweight async cursor stub for repository and API tests."""

    def __init__(
        self,
        *,
        fetchone: Any = None,
        fetchall: Iterable[Any] | Callable[[], Iterable[Any]] | None = None,
        rowcount: int | Callable[[], int] = 0,
    ) -> None:
        self._fetchone = fetchone
        self._fetchall = fetchall or []
        self._rowcount = rowcount
        self.queries: list[tuple[Any, Any]] = []
        self.last_sql: Any = None
        self.last_params: Any = None

    async def __aenter__(self) -> "FakeAsyncCursor":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        return None

    async def execute(self, sql: Any, params: Any = None) -> None:
        self.last_sql = sql
        self.last_params = params
        self.queries.append((sql, params))

    async def fetchone(self) -> Any:
        if callable(self._fetchone):
            return self._fetchone()
        return self._fetchone

    async def fetchall(self) -> list[Any]:
        data = self._fetchall() if callable(self._fetchall) else self._fetchall
        return list(data)

    @property
    def rowcount(self) -> int:
        if callable(self._rowcount):
            return int(self._rowcount())
        return int(self._rowcount)


class FakeAsyncConnection:
    """Async connection stub that serves a queue of prepared cursors."""

    def __init__(self, cursors: Iterable[FakeAsyncCursor]) -> None:
        self._cursors = list(cursors)
        self.cursor_calls = 0

    def cursor(self, *args: Any, **kwargs: Any) -> FakeAsyncCursor:
        if self.cursor_calls >= len(self._cursors):
            raise AssertionError("No fake cursor available for requested call")
        cur = self._cursors[self.cursor_calls]
        self.cursor_calls += 1
        return cur

    def __repr__(self) -> str:
        return f"FakeAsyncConnection(cursor_calls={self.cursor_calls})"


class FakeAsyncTransaction:
    async def __aenter__(self) -> "FakeAsyncTransaction":  # pragma: no cover - trivial
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - trivial
        return None


class FakePool:
    """Minimal AsyncConnectionPool replacement for db tests."""

    def __init__(self, *, connection: FakeAsyncConnection) -> None:
        self._connection = connection
        self.connection_calls = 0

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[FakeAsyncConnection]:
        self.connection_calls += 1
        yield self._connection


@pytest.fixture
def fake_user() -> dict[str, Any]:
    return {"sub": "user-123", "email": "test@example.com"}


def make_subscription_cursor(has_active: bool = True) -> FakeAsyncCursor:
    """Create a cursor that returns subscription check result.

    The subscription middleware calls has_active_subscription(%s) which returns
    a boolean. This helper creates a cursor that returns the expected result.

    Args:
        has_active: Whether the user has an active subscription (default True)

    Returns:
        FakeAsyncCursor configured for subscription check
    """
    return FakeAsyncCursor(fetchone=(has_active,))

