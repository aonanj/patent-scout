from __future__ import annotations

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest

from app import db as db_module
from tests.conftest import FakeAsyncConnection, FakeAsyncCursor, FakeAsyncTransaction


class StubPool:
    def __init__(self, *, connection: FakeAsyncConnection, **_: object) -> None:
        self._connection = connection
        self.connection_calls = 0

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[FakeAsyncConnection]:
        self.connection_calls += 1
        yield self._connection


class ConnWithTransaction(FakeAsyncConnection):
    def __init__(self) -> None:
        super().__init__(cursors=[])

    def transaction(self) -> FakeAsyncTransaction:
        return FakeAsyncTransaction()


@pytest.fixture(autouse=True)
def reset_pool() -> None:
    db_module._pool = None


def test_init_pool_creates_pool_once(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_conn = ConnWithTransaction()

    def fake_factory(**kwargs: object) -> StubPool:
        return StubPool(connection=fake_conn, **kwargs)

    monkeypatch.setattr(
        db_module,
        "get_settings",
        lambda: type("S", (), {"database_url": "postgresql://user:pass@localhost/db"})(),
    )
    monkeypatch.setattr(db_module, "AsyncConnectionPool", fake_factory)

    first = db_module.init_pool()
    second = db_module.init_pool()

    assert first is second
    assert isinstance(first, StubPool)


def test_get_conn_yields_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_cursor = FakeAsyncCursor(fetchone={"count": 1})
    fake_conn = ConnWithTransaction()
    fake_conn._cursors.append(fake_cursor)

    def fake_factory(**kwargs: object) -> StubPool:
        return StubPool(connection=fake_conn, **kwargs)

    monkeypatch.setattr(
        db_module,
        "get_settings",
        lambda: type("S", (), {"database_url": "postgresql://user:pass@localhost/db"})(),
    )
    monkeypatch.setattr(db_module, "AsyncConnectionPool", fake_factory)

    async def _run() -> None:
        agen = db_module.get_conn()
        conn = await agen.__anext__()
        try:
            assert conn is fake_conn
            cursor = conn.cursor()
            async with cursor:
                await cursor.execute("SELECT 1")
                row = await cursor.fetchone()
                assert row == {"count": 1}
        finally:
            with pytest.raises(StopAsyncIteration):
                await agen.__anext__()

    asyncio.run(_run())
