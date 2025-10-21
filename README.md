# Patent Scout

> Patent Scout delivers confidence-first patent intelligence for AI R&D teams. The platform blends hybrid semantic search, trend analytics, whitespace graphing, and proactive alerts on top of a pgvector-powered corpus that is refreshed by an automated ETL into Postgres. Current corpus includes AI-related 46k+ patents and publications dating back to 2023. 

## Overview
The repository contains the full Patent Scout stack: FastAPI exposes the search, export, trend, saved-query, and whitespace endpoints; Next.js App Router (React 19) provides the Auth0-gated UI and API proxy; a BigQuery + OpenAI ETL keeps the corpus current; and a Mailgun-capable alerts runner notifies subscribers when new filings match their saved scopes.

## Feature Highlights
- Hybrid keyword + vector search with semantic embeddings, adaptive result trimming, CSV/PDF export, and patent detail expansion (`app/api.py`, `app/page.tsx`).
- Auth0-protected React UI with saved-alert management, login overlay, and modal workspace for alert toggles (`components/NavBar.tsx`, `app/layout.tsx`).
- Whitespace analytics on focus keyword(s) and/or CPC(s) using igraph, UMAP, Leiden clustering, and signal scoring ordered by Assignee, and visually indicated through an interactive Sigma.js graph (`app/whitespace_api.py`, `components/SigmaWhitespaceGraph.tsx`, `app/whitespace/page.tsx`).
- Automated BigQuery ingestion, OpenAI embedding generation, and Mailgun/console alert notifications packaged as standalone runners (`etl.py`, `alerts_runner.py`).
- Comprehensive pytest suite covering authentication, repository search logic, whitespace signal math, and API contracts (`tests/`).

## Live Deployment
- App: https://patent-scout.vercel.app/
- Demo login: `phaethon@phaethon.llc` / `pollc123#` (Auth0 username/password grant)

## Architecture
```text
                         ┌───────────────────────┐
                         │         Auth0         │
                         └──────────┬────────────┘
                                    │
┌────────────────────────┐   OIDC   │
│ Next.js App Router UI  │◄─────────┘
│ (React 19, Auth0 SDK)  │
└───────────┬────────────┘
            │ /api/* proxy               async pg pool
            ▼                                     │
┌────────────────────────┐        ┌────────────────────────────┐
│ FastAPI service        │◄──────►│ Postgres + pgvector        │
│ app/api.py             │        │ patent, embeddings, alerts │
│ └─ whitespace_api.py   │        └─────────┬──────────────────┘
└───────────┬────────────┘                  │
            │                               │
            │                       ┌──────────────────────────┐
            │                       │ BigQuery + OpenAI ETL    │
            │                       │ etl.py                   │
            │                       └────────┬─────────────────┘
            │                                │ saved query delta
            │                                │                               
            ▼                                ▼ 
┌────────────────────────┐         ┌──────────────────────────┐
│ Alerts runner          │────────►│  Mailgun/                │───► (subscribers)
│                        │         │  console notifications   │ 
│ alerts_runner.py       │         └──────────────────────────┘
└────────────────────────┘
```

## Tech Stack
- Backend: FastAPI 0.116, Pydantic v2, psycopg 3 async pools, optional ReportLab export, whitespace analytics with igraph, leidenalg, umap-learn, and scikit-learn (`app/`).
- Frontend: Next.js 15 App Router, React 19, Auth0 React SDK, Sigma.js, Graphology, Tailwind CLI, and inline design system (`app/*.tsx`, `components/`).
- Data & Tooling: Google BigQuery, OpenAI `text-embedding-3` models, Alembic migrations, pip-tools lockfiles, pytest, and Ruff (`etl.py`, `migrations/`, `tests/`).

## Repository Layout
```
├── app/
│   ├── api.py                  # FastAPI application & routers
│   ├── whitespace_api.py       # Whitespace analytics endpoint
│   ├── api/                    # Next.js route handlers (backend proxy)
│   ├── page.tsx                # Search & trends experience
│   ├── whitespace/page.tsx     # Whitespace exploration UI
│   ├── docs/                   # Static docs / legal pages
│   ├── auth.py, config.py, db.py, repository.py, schemas.py
│   └── providers.tsx, layout.tsx, globals.css
├── components/
│   ├── NavBar.tsx              # Auth0-aware navigation & alert modal
│   └── SigmaWhitespaceGraph.tsx# Sigma.js graph renderer
├── tests/                      # pytest suite (API, repository, signals, auth)
├── migrations/                 # Alembic environment + versions
├── docs/screenshots/           # UI & API imagery
├── infrastructure/logger.py    # Shared logging helper
├── etl.py                      # BigQuery → Postgres loader + embeddings
├── alerts_runner.py            # Saved-query alert executor
├── Dockerfile & start.sh       # FastAPI container entrypoint (runs Alembic)
├── requirements.in/.txt        # pip-tools inputs & lock
├── package.json                # Next.js workspace configuration
└── resources/                  # Commercial ToS & privacy policy source docs
```

## Setup

### Prerequisites
- Python 3.12+
- Node.js 20+ (Next.js 15 target)
- Postgres 15+ with the `pgvector` extension enabled
- Auth0 tenant (Machine-to-Machine + SPA apps) and an OpenAI API key
- Optional: Google Cloud project for BigQuery access, Mailgun account for alerts

### Backend (FastAPI)
```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://user:pass@host:5432/dbname"
export SQLALCHEMY_DATABASE_URI="$DATABASE_URL"
uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Next.js)
```bash
npm install
echo "NEXT_PUBLIC_AUTH0_DOMAIN=..." >> .env.local
echo "NEXT_PUBLIC_AUTH0_CLIENT_ID=..." >> .env.local
echo "NEXT_PUBLIC_AUTH0_AUDIENCE=..." >> .env.local
echo "BACKEND_URL=http://localhost:8000" >> .env.local
npm run dev   # http://localhost:3000
```
Next.js route handlers under `app/api/*` forward requests to the FastAPI service and preserve the `Authorization` header so Auth0 access tokens remain valid end-to-end.

### Docker (API only)
```bash
docker build -t patent-scout .
docker run --rm -p 8000:8000 --env-file .env patent-scout
```
The bundled `start.sh` executes `alembic upgrade head` before launching Uvicorn.

### Running Tests
```bash
pytest
```
Unit and integration tests cover search repository queries, API endpoints, Auth0 config validation, whitespace signals, and database helpers.

## Environment Variables

### Backend / FastAPI
- `DATABASE_URL` – Primary Postgres DSN (required).
- `SQLALCHEMY_DATABASE_URI` – Matching DSN for Alembic migrations (required).
- `AUTH0_DOMAIN` / `AUTH0_API_AUDIENCE` – Issuer + audience for JWT validation.
- `CORS_ALLOW_ORIGINS` – Comma-separated allowlist for the API gateway.

- `OPENAI_API_KEY` – Enables semantic queries, PDF export enrichment, and ETL embeddings.
- `EMBEDDING_MODEL` / `SEMANTIC_TOPK` / `SEMANTIC_JUMP` / `VECTOR_TYPE` – Hybrid search tuning knobs.
- `EXPORT_MAX_ROWS` / `EXPORT_SEMANTIC_TOPK` – Export limits shared by CSV/PDF generators.
- `WS_EMBEDDING_MODEL` – Preferred embedding suffix for whitespace analytics.

### Frontend / Next.js
- `NEXT_PUBLIC_AUTH0_DOMAIN`
- `NEXT_PUBLIC_AUTH0_CLIENT_ID`
- `NEXT_PUBLIC_AUTH0_AUDIENCE`
- `BACKEND_URL` – Origin of the FastAPI service consumed by proxy routes.

### ETL & Alerts
- `GOOGLE_APPLICATION_CREDENTIALS` – Service account JSON for BigQuery reader access.
- `AI_CPC_REGEX` – Optional override of CPC filter regex applied in the ETL.
- `MAILGUN_DOMAIN` / `MAILGUN_API_KEY` / `MAILGUN_FROM_NAME` / `MAILGUN_FROM_EMAIL` / `MAILGUN_BASE_URL` – Alert delivery configuration (falls back to console logging when unset).
- `EMB_BATCH_SIZE` / `EMB_MAX_CHARS` – Embedding throughput guards used by `etl.py`.

## Data Pipeline (`etl.py`)
`etl.py` loads AI-focused US filings from Google’s public patents dataset, normalizes CPC codes, upserts metadata into Postgres, and generates OpenAI embeddings for both title+abstract (`...|ta`) and claims (`...|claims`). Runs are idempotent via the `ingest_log` table and hash-based deduplication. Usage example:
```bash
python etl.py \
  --project your-gcp-project \
  --dsn "postgresql://user:pass@host/db?sslmode=require" \
  --date-from 2024-01-01 \
  --date-to 2024-02-01 \
  --embed --claims
```

## Alerts Runner (`alerts_runner.py`)
The alert runner replays saved queries, diffing against the last `alert_event` timestamp per query. Matching patents are emailed through Mailgun (or printed to stdout when Mailgun is not configured). Run locally with:
```bash
python alerts_runner.py
```

## Whitespace Analytics
`app/whitespace_api.py` builds localized patent graphs by selecting a model (`WS_EMBEDDING_MODEL`), computing cosine KNN, clustering with Leiden, scoring whitespace intensity, and evaluating signal rules for focus convergence, emerging gaps, crowd-out risk, and bridge opportunities. The `/whitespace/graph` endpoint accepts filters, neighbor counts, and layout configuration; the React page renders the response with Sigma.js and surfaces per-assignee signal cards plus patent examples.

## Screenshots
- Search & Trends UI – `docs/screenshots/search-ui.png`
- Whitespace Signals UI – `docs/screenshots/whitespace-ui.png`
- Patent Scout API Docs – `docs/screenshots/api-docs.png`

## Commercial Collateral
Supporting privacy policy and terms of service documents live in `resources/` alongside marketing pages under `app/docs/`.

## License
This repository is publicly viewable for portfolio purposes only. The code is proprietary.
Copyright © 2025 Phaethon Order LLC. All rights reserved.
See [LICENSE](LICENSE.md) for terms.

## Contact
Questions or support: [support@phaethon.llc](mailto:support@phaethon.llc).
