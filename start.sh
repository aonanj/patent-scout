#!/usr/bin/env sh
set -e

alembic upgrade head
exec uvicorn app.api:app --host 0.0.0.0 --port "${PORT:-8000}"
