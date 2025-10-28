"""Helpers for classifying recoverable database errors."""

from __future__ import annotations

from collections.abc import Iterable

import psycopg


_RECOVERABLE_SUBSTRINGS: tuple[str, ...] = (
    "ssl connection has been closed unexpectedly",
    "server closed the connection unexpectedly",
    "connection already closed",
    "connection not open",
)


def _iter_causes(exc: BaseException) -> Iterable[BaseException]:
    """Yield the exception and its causes."""
    current: BaseException | None = exc
    while current is not None:
        yield current
        current = current.__cause__  # type: ignore[attr-defined]


def is_recoverable_operational_error(exc: BaseException) -> bool:
    """Return True when the error represents a dropped database connection."""
    if not isinstance(exc, psycopg.OperationalError):
        return False

    for candidate in _iter_causes(exc):
        message = " ".join(
            part for part in (str(candidate), getattr(candidate, "pgerror", None)) if part
        ).lower()
        if any(token in message for token in _RECOVERABLE_SUBSTRINGS):
            return True
    return False
