from __future__ import annotations

"""Optional observability hooks (Sentry, etc.) for FastAPI.

Call init_sentry_if_configured() early at startup. If environment variables
are not present or sentry-sdk is not installed, this becomes a no-op.
"""

import logging
import os

from infrastructure.logger import get_logger


def init_sentry_if_configured() -> None:
    """Initialize Sentry only when SENTRY_DSN is provided.

    Environment variables (optional):
      - SENTRY_DSN
      - SENTRY_ENVIRONMENT (default: "production")
      - SENTRY_RELEASE
      - SENTRY_TRACES_SAMPLE_RATE (float, default: 0.0)
      - SENTRY_PROFILES_SAMPLE_RATE (float, default: 0.0)
    """
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        traces = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0"))
        profiles = float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0"))
        environment = os.getenv("SENTRY_ENVIRONMENT", "production")
        release = os.getenv("SENTRY_RELEASE")

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
        get_logger().info("✓ Sentry initialized for FastAPI (env=%s)", environment)
    except Exception as exc:  # pragma: no cover - defensive
        get_logger().error("Failed to initialize Sentry: %s", exc)

