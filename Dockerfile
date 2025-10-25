# syntax=docker/dockerfile:1

FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VIRTUALENVS_CREATE=false

# System deps for psycopg/psycopg2, uvloop, and builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    pkg-config \
    curl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# If using requirements.txt:
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# If using pyproject.toml instead, comment the two lines above and use:
# COPY pyproject.toml poetry.lock* /app/
# RUN pip install --upgrade pip poetry && poetry install --no-root --only main

# Copy source
COPY . /app
RUN chmod +x /app/start.sh

# Render provides PORT. Default to 8000 for local runs.
ENV PORT=8000

# Non-root runtime user
RUN useradd -m runner
USER runner

# Expose for local; Render ignores EXPOSE
EXPOSE 8000

# Uvicorn entrypoint: import FastAPI app from api.py as "app"
CMD ["./start.sh"]
