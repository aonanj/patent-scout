# Patent Scout

> Patent Scout is a data and analytics platform for artificial intelligence (AI) and machine learning (ML) IP. The platform blends hybrid semantic search, trend analytics, whitespace graphing, and proactive alerts on top of a pgvector-powered corpus that is refreshed by automated ETL pipelines. Current corpus includes 56k+ AI/ML-related patents and publications dating back to 2023, with support for multiple data sources including BigQuery, USPTO ODP API, and bulk XML feeds.

## Overview
The repository contains the full Patent Scout stack: FastAPI exposes the search, export, trend, saved-query, and whitespace endpoints; Next.js 15 App Router (React 19) provides the Auth0-gated UI and API proxy; multiple ETL pipelines (BigQuery, USPTO API, bulk XML) with AI embeddings keep the corpus current; and a Mailgun-capable alerts runner notifies subscribers when new filings match their saved scopes. User-specific whitespace analysis tables enable personalized AI/ML IP landscape exploration with isolated graph computation.

## Feature Highlights
- Hybrid keyword + vector search with semantic embeddings, adaptive result trimming, CSV/PDF export, and patent/application detail expansion ([app/api.py](app/api.py), [app/page.tsx](app/page.tsx)). Filters are edited live, but searches only execute when the user clicks the `Apply` button, removing prior debounce-driven inconsistencies across the trend graph and table.
- Auth0-protected React UI with saved-alert management, login overlay, and modal workspace for alert toggles ([components/NavBar.tsx](components/NavBar.tsx), [app/layout.tsx](app/layout.tsx)).
- Whitespace analytics on focus keyword(s) and/or CPC(s) using igraph, UMAP, Leiden clustering, and signal scoring ordered by Assignee, and visually indicated through an interactive Sigma.js graph ([app/whitespace_api.py](app/whitespace_api.py), [app/whitespace_signals.py](app/whitespace_signals.py), [components/SigmaWhitespaceGraph.tsx](components/SigmaWhitespaceGraph.tsx), [app/whitespace/page.tsx](app/whitespace/page.tsx)).
- Canonical assignee name normalization for improved entity matching and trend analysis ([add_canon_name.py](add_canon_name.py)).
- Multiple data ingestion pipelines: BigQuery loader ([etl.py](etl.py)), USPTO PEDS API loader ([etl_uspto.py](etl_uspto.py)), and bulk XML parser ([etl_xml_fulltext.py](etl_xml_fulltext.py)) for comprehensive patent and application coverage.
- Embedding backfill utility for maintaining vector search quality across historical data ([etl_add_embeddings.py](etl_add_embeddings.py)).
- Automated Mailgun/console alert notifications for saved queries packaged as standalone runner ([alerts_runner.py](alerts_runner.py)).
- User-specific whitespace analysis with isolated graph computation and personalized signal detection.
- Comprehensive pytest suite covering authentication, repository search logic, whitespace signal math, and API contracts ([tests/](tests/)).

## Live Deployment
- App: https://patent-scout.com/
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
- **Backend**: FastAPI 0.115+, Pydantic v2, psycopg 3 async pools, asyncpg 0.30+, aiosmtplib 4.0+, whitespace analytics with igraph, leidenalg, umap-learn, and scikit-learn ([app/](app/)).
- **Frontend**: Next.js 15.5, React 19.1, Auth0 React SDK 2.4, Sigma.js 3.0-beta, Graphology 0.25, Force-Atlas2 layout, Tailwind CSS 3.4, TypeScript 5.9 ([app/*.tsx](app/), [components/](components/)).
- **Data Pipelines**: Google BigQuery, USPTO PEDS API, USPTO bulk XML parsing, OpenAI `text-embedding-3` models ([etl.py](etl.py), [etl_uspto.py](etl_uspto.py), [etl_xml_fulltext.py](etl_xml_fulltext.py)).
- **Infrastructure & Tooling**: Postgres 15+ with pgvector, Alembic migrations, pytest with asyncio support, Ruff linting, pip-tools lockfiles, Docker containerization ([migrations/](migrations/), [tests/](tests/)).

## Repository Layout
```
├── app/
│   ├── api.py                       # FastAPI application & routers
│   ├── whitespace_api.py            # Whitespace analytics endpoint
│   ├── whitespace_signals.py        # Whitespace signal calculation logic
│   ├── auth.py                      # Auth0 JWT validation
│   ├── config.py                    # Settings from environment
│   ├── db.py                        # Async DB connection pools
│   ├── repository.py                # SQL query builders & search logic
│   ├── schemas.py                   # Pydantic models
│   ├── embed.py                     # OpenAI embedding client
│   ├── api/                         # Next.js route handlers (backend proxy)
│   │   ├── search/route.ts          # Search proxy
│   │   ├── export/route.ts          # CSV/PDF export
│   │   ├── trend/volume/route.ts    # Trend analytics
│   │   ├── saved-queries/           # Alert CRUD endpoints
│   │   └── whitespace/graph/        # Whitespace graph endpoints
│   ├── page.tsx                     # Search & trends experience
│   ├── whitespace/page.tsx          # Whitespace exploration UI
│   ├── help/                        # Help documentation pages
│   │   ├── page.tsx                 # Help index
│   │   ├── search_trends/page.tsx   # Search & trends help
│   │   └── whitespace/page.tsx      # Whitespace help
│   ├── docs/                        # Legal & commercial pages
│   │   ├── privacy/page.tsx         # Privacy policy
│   │   ├── tos/page.tsx             # Terms of service
│   │   └── dpa/page.tsx             # Data Processing Agreement
│   └── providers.tsx, layout.tsx, globals.css
├── components/
│   ├── NavBar.tsx                   # Auth0-aware navigation & alert modal
│   └── SigmaWhitespaceGraph.tsx     # Sigma.js graph renderer
├── tests/                           # pytest suite (API, repository, signals, auth)
│   ├── test_api.py, test_auth.py, test_config.py, test_db.py
│   ├── test_embed.py, test_repository.py
│   └── test_whitespace_signals.py, test_whitespace_utils.py
├── migrations/                      # Alembic environment + versions
│   ├── env.py                       # Migration configuration
│   └── versions/                    # Schema migrations (whitespace, user tables)
├── docs/
│   ├── screenshots/                 # UI & API imagery
│   └── uspto_odp_api/               # USPTO API schema reference
├── public/                          # Static assets (favicon, logos)
├── types/                           # TypeScript ambient declarations
├── infrastructure/
│   └── logger.py                    # Centralized logging utility
├── resources/                       # Commercial ToS & privacy policy source docs
├── etl.py                           # BigQuery → Postgres loader + embeddings
├── etl_uspto.py                     # USPTO PEDS API loader (alternative pipeline)
├── etl_xml_fulltext.py              # USPTO bulk XML parser for abstracts/claims
├── etl_add_embeddings.py            # Backfill missing embeddings by date range
├── add_canon_name.py                # Assignee name normalization script
├── alerts_runner.py                 # Saved-query alert executor
├── Dockerfile & start.sh            # FastAPI container entrypoint (runs Alembic)
├── pyproject.toml                   # Python project metadata & dependencies
├── requirements.in/.txt             # pip-tools inputs & lock
├── package.json                     # Next.js workspace configuration
├── tsconfig.json                    # TypeScript configuration
└── tailwind.config.js               # Tailwind CSS styling
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
- `NEXT_PUBLIC_GLITCHTIP_DSN` – Optional: browser GlitchTip DSN to capture client errors.
- `NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT` / `NEXT_PUBLIC_GLITCHTIP_RELEASE` – Optional metadata for GlitchTip issues.
- `NEXT_PUBLIC_GLITCHTIP_TRACES_SAMPLE_RATE` / `NEXT_PUBLIC_GLITCHTIP_PROFILES_SAMPLE_RATE` – Optional performance sampling (0–1).

### ETL & Alerts
- `GOOGLE_APPLICATION_CREDENTIALS` – Service account JSON for BigQuery reader access.
- `AI_CPC_REGEX` – Optional override of CPC filter regex applied in the ETL.
- `MAILGUN_DOMAIN` / `MAILGUN_API_KEY` / `MAILGUN_FROM_NAME` / `MAILGUN_FROM_EMAIL` / `MAILGUN_BASE_URL` – Alert delivery configuration (falls back to console logging when unset).
- `EMB_BATCH_SIZE` / `EMB_MAX_CHARS` – Embedding throughput guards used by `etl.py`.

### Observability (FastAPI)
- `GLITCHTIP_DSN` – Optional: enable GlitchTip for backend exceptions.
- `GLITCHTIP_ENVIRONMENT` / `GLITCHTIP_RELEASE` – Optional metadata.
- `GLITCHTIP_TRACES_SAMPLE_RATE` / `GLITCHTIP_PROFILES_SAMPLE_RATE` – Optional performance sampling (0–1).

### GlitchTip Sourcemaps (Next.js)
- Install when ready: `npm i -E @sentry/nextjs` (GlitchTip speaks the Sentry protocol).
- Configure CI/CD with the following secrets for sourcemap uploads:
  - `GLITCHTIP_URL` (or `SENTRY_URL`) – e.g., `https://app.glitchtip.com`
  - `GLITCHTIP_AUTH_TOKEN` (same scopes as the Sentry CLI)
  - `GLITCHTIP_ORG` – your GlitchTip org slug
  - `GLITCHTIP_PROJECT` – the project slug receiving frontend errors
- Optionally, create `.sentryclirc` (see `.sentryclirc.example`) instead of env vars.
- The build plugin is enabled automatically by `next.config.js` when `@sentry/nextjs` is present. Source maps are hidden from clients (`sentry.hideSourceMaps: true`) and uploaded to GlitchTip during production builds.

## Data Pipeline (`etl.py`)
`etl.py` loads AI-focused US filings from Google’s public patent publication dataset, normalizes CPC codes, upserts metadata into Postgres, and generates OpenAI embeddings for both title+abstract (`...|ta`) and claims (`...|claims`). Runs are idempotent via the `ingest_log` table and hash-based deduplication. Usage example:
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

## Additional Data Pipeline Scripts

### USPTO PEDS API Loader (`etl_uspto.py`)
Alternative to BigQuery ingestion, loads patent publication data directly from the USPTO Open Data Portal (ODP) API. Filters by CPC codes and AI keywords locally:
```bash
python etl_uspto.py \
  --dsn "postgresql://user:pass@host/db?sslmode=require" \
  --date-from 2024-01-01 \
  --date-to 2024-02-01 \
  --embed --claims
```

### USPTO Bulk XML Parser (`etl_xml_fulltext.py`)
Parses USPTO bulk XML files (weekly patent grant and publication feeds) to extract full-text abstracts and claims. Updates `patent_staging` table with parsed content:
```bash
python etl_xml_fulltext.py \
  --xml resources/ipa250220.xml \
  --dsn "postgresql://user:pass@host/db?sslmode=require"
```

### Embedding Backfill Utility (`etl_add_embeddings.py`)
Backfills missing embeddings for patents and applications within a specified date range. Supports both title+abstract (`|ta`) and claims (`|claims`) embedding models:
```bash
python etl_add_embeddings.py \
  --dsn "postgresql://user:pass@host/db?sslmode=require" \
  --date-from 2024-01-01 \
  --date-to 2024-02-01 \
  --model text-embedding-3-small \
  --suffix ta
```

### Canonical Assignee Normalizer (`add_canon_name.py`)
Generates canonical assignee names by removing common corporate suffixes (Inc., LLC, Corp., etc.) to improve entity matching and trend analysis. Creates entries in `canonical_assignee_name` and `assignee_alias` tables:
```bash
python add_canon_name.py \
  --dsn "postgresql://user:pass@host/db?sslmode=require"
```

## Whitespace Analytics
[app/whitespace_api.py](app/whitespace_api.py) builds user-specific patent and publication graphs by selecting an embedding model (`WS_EMBEDDING_MODEL`), computing cosine KNN neighborhoods, applying Leiden community detection, and scoring whitespace intensity per assignee. Signal detection logic in [app/whitespace_signals.py](app/whitespace_signals.py) evaluates focus convergence, emerging gaps, crowd-out risk, and bridge opportunities based on patent and publication clustering patterns and assignee behavior.

The `/whitespace/graph` endpoint accepts filters (keywords, CPCs, date ranges), neighbor counts, and layout configuration. The React UI ([app/whitespace/page.tsx](app/whitespace/page.tsx)) renders the response with Sigma.js and Force-Atlas2 layout, surfaces per-assignee signal cards, and displays detailed patent and publication examples. User-specific whitespace tables ensure isolated analysis per authenticated user.

## Screenshots
- Search & Trends UI – ![docs/screenshots/search-ui.png](docs/screenshots/search-ui.png)
- Whitespace Signals UI – ![docs/screenshots/whitespace-ui.png](docs/screenshots/whitespace-ui.png)
- Patent Scout API Docs – ![docs/screenshots/api-docs.png](docs/screenshots/api-docs.png)

## Documentation & Legal Pages
- **Help Documentation**: Interactive help pages available at `/help`, including detailed guides for [search & trends](app/help/search_trends/page.tsx) and [whitespace analytics](app/help/whitespace/page.tsx).
- **Legal Pages**: Privacy policy ([app/docs/privacy/page.tsx](app/docs/privacy/page.tsx)), Terms of Service ([app/docs/tos/page.tsx](app/docs/tos/page.tsx)), and Data Processing Agreement ([app/docs/dpa/page.tsx](app/docs/dpa/page.tsx)).

## License
This repository is publicly viewable for portfolio purposes only. The code is proprietary.
Copyright © 2025 Phaethon Order LLC. All rights reserved.
See [LICENSE](LICENSE.md) for terms.

## Contact
Questions or support: [support@phaethon.llc](mailto:support@phaethon.llc).
