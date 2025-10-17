# Patent Scout

> Confidence-first patent intelligence for AI R&D teams. Patent Scout blends semantic search, trend analytics, whitespace graphing, and proactive alerts on top of a Postgres + pgvector corpus of AI-focused patents. Automated cron job ensures up-to-date corpus of AI-focused patent filings (currently includes 45,000+ patent filings dating back to 2023). 

## Highlights
- Hybrid keyword + vector search with debounced filters, semantic queries, paginated results, and CSV/PDF export (`app/page.tsx`).
- Auth0-gated Next.js App Router UI with saved-alert management, login overlay, and global navigation (`components/NavBar.tsx`, `app/layout.tsx`).
- Whitespace exploration page with interactive Sigma graph, signal scoring, and advanced parameters for network tuning (`app/whitespace/page.tsx`, `components/SigmaWhitespaceGraph.tsx`).
- FastAPI backend that orchestrates search, trends, exports, saved queries, patent metadata, and whitespace analysis (`app/api.py`, `app/whitespace_api.py`).
- Automated data pipeline and notifications: BigQuery loader writes patents + embeddings, and a Mailgun-capable runner delivers saved-query digests (`etl.py`, `alerts_runner.py`).

## Live Deployment
- App: https://patent-scout.vercel.app/
- Demo login: `phaethon@phaethon.llc` / `pollc123#` (Auth0 username/password grant)

### Screenshots

#### Search & Trends UI
![Search & Trends UI](docs/screenshots/search-ui.png)

#### Whitespace Signals UI
![Whitespace Signals UI](docs/screenshots/whitespace-ui.png)

#### Patent Scout API Docs
![API Docs](docs/screenshots/api-docs.png)

## Architecture Overview
```text
                        ┌────────────────────┐
                        │      Auth0         │
                        └────────┬───────────┘
                                 │
┌──────────────────────┐   SPA + API proxy   ┌─────────────────────┐
│  Next.js App Router  │────────────────────►│   FastAPI service   │
│ (app/*.tsx, NavBar)  │◄────────────────────│ (app/api.py + auth) │
└─────────┬────────────┘        JWT          └─────────┬───────────┘
          │                                       async pg pool
          │                                            │
          │            embeddings + metadata           │
          ▼                                            ▼
┌──────────────────────┐                      ┌────────────────────┐
│ BigQuery ETL (etl.py)│────────────────────► │ Postgres + pgvector│
│ + OpenAI embeddings  │                      │ patent corpus      │
└─────────┬────────────┘                      └─────────┬──────────┘
          │                                             │
          │ new results / saved filters                 │
          ▼                                             ▼
┌──────────────────────┐                      ┌────────────────────┐
│ Alerts Runner        │ ────Mailgun/stdout─► │ saved_query /      │
│ (alerts_runner.py)   │                      │ alert_event tables │
└──────────────────────┘                      └────────────────────┘
```
#### Repo layout
```
├── etl.py                     # Corpus update / cron job logic
├── alerts_runner.py           # Alerts / cron job logic
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Container configuration
├── .github/workflows          # cron job scripts
│   ├── alerts.yml             # alerts cron job script
│   └── etl_weekly.yml         # corpus update cron job script
├── app/                    
│   ├── api.py                 # REST API endpoints
│   ├── auth.py                # Authentication via Auth0
│   ├── config.py              # Configuration
│   ├── db.py                  # Database connection/config
│   ├── embed.py               # Embeddings
│   ├── globals.css            # CSS styles
│   ├── layout.tsx             # Typescript layout
│   ├── page.tsx               # Search & Trends page
│   ├── providers.tsx          # Providers config
│   ├── repository.py          # Search & trends logic
│   ├── schemas.py             # Models
│   ├── whitespace_api.py      # REST API endpoints for whitespace
│   ├── whitespace_signals.py  # Whitespace signals logic
│   ├── api/                   # Search & Trends API endpoints
│   │    └── ...
│   └── whitespace/              # Whitespace API endpoints
│   │    └── ...
├── infrastructure/            # Core processing modules
│   └── logger.py              # Logging configuration
└── components/                # Web UI components
    ├── NavBar.tsx             # Navigation Bar UI
    └── SigmaWhitespaceGraph.tsx  # Whitespace signals graph

```


Key components:
- **Frontend** – Next.js App Router (React 19) served via Vercel, using Auth0 React SDK for authentication and proxying API calls back to the FastAPI backend.
- **API** – FastAPI application exposing search, trend aggregation, export, patent details, saved query CRUD, and whitespace analysis endpoints; all guarded by Auth0 JWT validation.
- **Database** – Postgres (current implementation uses Neon.tech) with `pgvector` for embeddings, analytic columns, and supporting tables for saved queries, alerts, and whitespace graph storage.
- **Analytics** – Whitespace computation performs KNN graph construction, Leiden clustering, UMAP layout, and signal scoring within the backend.
- **Automation** – Standalone ETL ingests patents from Google BigQuery and writes embeddings with OpenAI; alerts runner sends saved-query digests via Mailgun or logs to stdout. ETL is automated cron job scheduled for weekly runs, ensuring up-to-date patent filings database.

## UI & UX Walkthrough
1. **Auth overlay** – Users see a branded login overlay until Auth0 authentication completes (`app/page.tsx`).
2. **Search & filters** – Semantic description, keywords, assignee, CPC, and date window inputs are debounced to prevent API thrash; results include patent metadata, CPC classifications, and truncated abstract snippets.
3. **Trend chart** – Toggle between volume by month, CPC, or assignee; custom canvas chart handles aggregation client-side (`TrendChart` within `app/page.tsx`).
4. **Exports & alerts** – One-click CSV/PDF export forwards auth tokens to the backend; alerts modal in the global nav lists saved queries with enable/disable and delete controls (`components/NavBar.tsx`).
5. **Whitespace analysis** – Dedicated `/whitespace` route captures focus keywords/CPC codes and advanced graph parameters, then renders an interactive Sigma graph with hover tooltips, signal filtering, and node highlighting.
6. **Saved experiences** – Queries can be stored as alerts, scheduled externally by `alerts_runner.py`, and replayed with confidence-first messaging in the UI.

## Core Services & Modules
- `app/api.py` – FastAPI entrypoint; configures CORS, dependency-injected connection pooling, Auth0 guard (`app/auth.py`), hybrid search (`search_hybrid` in `app/repository.py`), trend volume aggregation, patent details, exports, and saved query CRUD.
- `app/whitespace_api.py` – `/whitespace/graph` router performing graph assembly, Leiden clustering, UMAP layout, signal computation (`app/whitespace_signals.py`), and persistence helpers such as `ensure_schema`.
- `app/repository.py` – SQL composition for keyword + vector hybrid search, adaptive score filtering, CSV/PDF export helpers, and utility filters.
- `app/embed.py` – Thin wrapper around the OpenAI Embeddings API with configurable model name. 
- `components/NavBar.tsx` – Auth-aware navigation bar with modal-based saved alert management, headless portal, and login/logout affordances.
- `components/SigmaWhitespaceGraph.tsx` – Graphology + Sigma renderer, colour/size scaling, camera controls, and signal-based highlighting for whitespace output.
- `app/page.tsx` – Main search screen incorporating filters, debounced fetchers, trend visualization, export workflow, pagination, and login overlay.
- `app/whitespace/page.tsx` – Advanced whitespace UI with parameter inputs, Auth0 token forwarding, result inspector, and signal summary cards.
- `alerts_runner.py` – Async worker that replays saved queries, finds new publications, and sends summaries through Mailgun.
- `etl.py` – BigQuery-to-Postgres ingestion with batching, embeddings, CPC normalization, and idempotent upserts.
- `tests/test_whitespace_signals.py` – Pytest coverage for signal scoring heuristics.

## Repository Map
- `app/` – FastAPI backend (`api.py`, `auth.py`, `db.py`, `repository.py`, `whitespace_*`) and Next.js App Router pages (`page.tsx`, `whitespace/page.tsx`) plus providers and global styles.
- `components/` – Reusable React components (`NavBar`, `SigmaWhitespaceGraph`).
- `app/api/` – Next.js edge proxy routes forwarding to the FastAPI service while preserving Auth0 bearer tokens.
- `docs/screenshots/` – Product screenshots embedded below.
- `infrastructure/` – Shared utilities such as structured logging setup.
- `public/` – Static assets (logos, favicons).
- `tests/` – Backend unit tests.
- `types/ambient.d.ts` – Ambient module declarations for Sigma/Graphology to satisfy TypeScript.
- `Dockerfile`, `pyproject.toml`, `package.json`, `requirements.txt` – Build + dependency manifests.

## Local Development

### Prerequisites
- Python 3.12+
- Node.js 18+
- Postgres 15+ with the `pgvector` extension enabled
- Auth0 tenant and OpenAI API key (or mocked responses)

### Backend (FastAPI)
```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Next.js)
```bash
npm install
npm run dev     # served at http://localhost:3000
```
Create `.env.local` with `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE`, and `BACKEND_URL` pointing to the FastAPI service (e.g. `http://localhost:8000`).

### End-to-end
1. Ensure Postgres is reachable and seeded (run `etl.py` or load sample data).
2. Launch FastAPI, then Next.js. The app proxies `/api/*` calls to `BACKEND_URL` while forwarding the Auth0 `Authorization` header.
3. Log in via Auth0 and exercise search, trends, exports, alerts, and whitespace analysis.

## Environment Variables

### Backend / FastAPI
- `DATABASE_URL` – Postgres connection string.
- `CORS_ALLOW_ORIGINS` – CSV of allowed origins (defaults include localhost, Render, and Vercel hosts).
- `AUTH0_DOMAIN`, `AUTH0_API_AUDIENCE` – Required for JWT validation.
- `OPENAI_API_KEY` – Enables embeddings in search + ETL.
- `EMBEDDING_MODEL`, `SEMANTIC_TOPK`, `SEMANTIC_JUMP`, `VECTOR_TYPE` – Optional tuning knobs for hybrid search.
- `EXPORT_MAX_ROWS`, `EXPORT_SEMANTIC_TOPK` – Export limits.
- `APP_DEBUG` – Enables additional logging.
- Optional PDF export: install `reportlab` (and set no extra env).

### Frontend / Next.js
- `NEXT_PUBLIC_AUTH0_DOMAIN`
- `NEXT_PUBLIC_AUTH0_CLIENT_ID`
- `NEXT_PUBLIC_AUTH0_AUDIENCE`
- `BACKEND_URL` – Base URL for the FastAPI service.

### ETL & Alerts
- `GOOGLE_APPLICATION_CREDENTIALS` – BigQuery credentials (or use default ADC).
- `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, `MAILGUN_FROM_NAME`, `MAILGUN_FROM_EMAIL`, `MAILGUN_BASE_URL` – Alert delivery (falls back to stdout when unset).

## Database Essentials
Core tables used by the application:
- `patent` – Canonical patent metadata (titles, abstracts, claims, CPC, assignee, inventor, pub/priority dates).
- `patent_embeddings` – Embedding vectors per patent & model, plus `cluster_id`, `local_density`, `whitespace_score`.
- `app_user` – Auth0 users mapped to alerts.
- `saved_query` – Saved filters, semantic queries, schedules, and active flag.
- `alert_event` – Historical alert runs and samples.
- `knn_edge` & `cluster_stats` – Materialized graph data powering whitespace analytics.
FastAPI automatically initializes whitespace tables via `ensure_schema`; indexes for full-text search, CPC JSONB, and pgvector are expected to exist.

## ETL Pipeline (`etl.py`)
- Pulls AI-focused US patents from Google’s public BigQuery dataset within a date window.
- Normalizes CPC codes, deduplicates assignees, and upserts into Postgres.
- Generates OpenAI embeddings for title+abstract (`...|ta`) and optionally claims (`...|claims`) while respecting dimensional hints and batching.
- Guards against re-processing via `ingest_log` hashes and idempotent UPSERT statements.
Example run:
```bash
python etl.py \
  --project your-gcp-project \
  --dsn "postgresql://user:pass@host/db?sslmode=require" \
  --date-from 2024-01-01 --date-to 2024-02-01 \
  --embed --claims
```

## Alerts & Saved Queries (`alerts_runner.py`)
- Replays saved queries, filtering by keywords, assignee, CPC, and date ranges since the last alert run.
- Sends Mailgun emails (or prints to stdout) with new results and sample links.
- Designed for cron/scheduled execution; persists runs to `alert_event`.
Running locally:
```bash
python alerts_runner.py
```

## Testing
- Backend unit tests (Pytest) live under `tests/`. Run `pytest` to execute the whitespace signal suite.
- Frontend currently relies on manual QA; hooks exist for future Playwright/Cypress additions.

## Docker
- `Dockerfile` builds the FastAPI service on Python 3.12 slim, installs dependencies from `requirements.txt`, and starts Uvicorn.
```bash
docker build -t patent-scout .
docker run -p 8000:8000 --env-file .env patent-scout
```
Deploy the Next.js frontend separately (e.g. Vercel) and set `BACKEND_URL` to the API host.

## Screenshots
- Search UI – `docs/screenshots/search-ui.png`
- Whitespace analysis – `docs/screenshots/whitespace-ui.png`
- FastAPI docs – `docs/screenshots/api-docs.png`

## License
This repository is publicly viewable for portfolio purposes only. The code is proprietary.
Copyright © 2025 Phaethon Order LLC. All rights reserved.
See [LICENSE](LICENSE.md) for terms.

## Contact
Questions or support: [support@phaethon.llc](mailto:support@phaethon.llc).
