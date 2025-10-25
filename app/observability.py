from __future__ import annotations

import logging
import os

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from infrastructure.logger import get_logger

logger = get_logger()


def _glitchtip_env(key: str, default: str | None = None) -> str | None:
    """Prefer GLITCHTIP_* env vars but fall back to legacy SENTRY_* names."""
    return os.getenv(f"GLITCHTIP_{key}") or os.getenv(f"NEXT_PUBLIC_GLITCHTIP_{key}") or os.getenv(f"SENTRY_{key}") or os.getenv(f"NEXT_PUBLIC_SENTRY_{key}") or default


def init_glitchtip_if_configured() -> None:
    """Initialize GlitchTip (Sentry-compatible) when GLITCHTIP_DSN is provided.

    Environment variables (optional):
      - GLITCHTIP_DSN (or SENTRY_DSN)
      - GLITCHTIP_ENVIRONMENT / GLITCHTIP_RELEASE
      - GLITCHTIP_TRACES_SAMPLE_RATE / GLITCHTIP_PROFILES_SAMPLE_RATE
    """
    dsn = _glitchtip_env("DSN")
    if not dsn:
        logger.error("GLITCHTIP_DSN not set; skipping GlitchTip initialization")
        return

    try:
        traces = float(_glitchtip_env("TRACES_SAMPLE_RATE", "0.0") or "0.0")
        profiles = float(_glitchtip_env("PROFILES_SAMPLE_RATE", "0.0") or "0.0")
        environment = _glitchtip_env("ENVIRONMENT", "production") or "production"
        release = _glitchtip_env("RELEASE")

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            traces_sample_rate=traces,
            profiles_sample_rate=profiles,
            integrations=[
                StarletteIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
        )
        logger.info("✓ GlitchTip initialized for FastAPI (env=%s)", environment)
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Failed to initialize GlitchTip: %s", exc)
