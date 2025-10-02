# Patent Scout

Search, trend analysis, whitespace graphing, and alerts for AI-related patents/publications using Postgres (Neon), pgvector, FastAPI, and a Next.js frontend.

- Hybrid search: full-text (GIN) + vector similarity (pgvector)
- Whitespace graph: KNN + Leiden clusters + UMAP layout, rendered with Sigma
- ETL: load from Google BigQuery, generate embeddings (OpenAI) and indexes
- Alerts: scheduled digests of new results (Mailgun)
- Frontend: Next.js App Router with API proxy routes and Auth0-based login

---

## Live Deployment

Visit: https://patent-scout.vercel.app/

- Login Credentials
  - Username: _phaethon@phaethon.llc_
  - Password: _pollc123#_

---

## Screenshots

### Next.js Search UI
![Search UI](docs/screenshots/search-ui.png)

### Whitespace Analysis UI
![Whitespace Analysis UI](docs/screenshots/whitespace-ui.png)

### FastAPI Swagger Docs
![API Docs](docs/screenshots/api-docs.png)

---

## Repo layout (what’s inside)

- `etl.py` — BigQuery → Postgres loader; upserts `patent` and `patent_embeddings`, creates indexes, and (optionally) generates embeddings.
- `alerts_runner.py` — Runs saved alerts and sends digests via Mailgun or logs to stdout.
- FastAPI backend
  - `app/api.py` — API routes: `/search`, `/saved-queries`, `/trend/volume`, `/patent/{pub_id}`, `/patent-date-range`, `/export` (+ CORS, startup pool).
  - `app/whitespace_api.py` — `/whitespace/graph` endpoint; computes KNN, clusters, momentum, scores, layout and persists results to DB.
  - `app/repository.py`, `app/db.py`, `app/embed.py`, `app/schemas.py` — data access, pooling, embeddings helper, Pydantic models.
  - `app/auth.py`, `app/config.py` — Auth0 token validation and settings.
- Next.js frontend (App Router)
  - Pages: `app/page.tsx` (search UI), `app/whitespace/page.tsx` (whitespace UI), `app/layout.tsx`, `app/providers.tsx` (Auth0 provider).
  - API proxies:
    - `app/api/search/route.ts` → `POST /search`
    - `app/api/saved-queries/route.ts`, `app/api/saved-queries/[id]/route.ts` → saved query CRUD
    - `app/api/trend/volume/route.ts` → `GET /trend/volume`
    - `app/api/patent-date-range/route.ts` → `GET /patent-date-range`
    - `app/api/export/route.ts` → `GET /export` (CSV/PDF)
    - `app/api/whitespace/graph/route.ts` → `POST /whitespace/graph`
- Components: `components/NavBar.tsx`, `components/SigmaWhitespaceGraph.tsx` (dynamic-imported; Sigma + Graphology)
- Infra: `Dockerfile`, `requirements.txt`, `pyproject.toml`, `package.json`

---

## Requirements

- Python 3.12+ (tested on 3.13)
- Postgres with `pgvector` extension (Neon.tech recommended)
- Node.js 18+ (Next.js 15, React 19)

Python highlights (see `requirements.txt`):
- API/ETL: `fastapi`, `uvicorn`, `psycopg[binary,pool]`, `python-dotenv`, `google-cloud-bigquery`, `tenacity`, `tqdm`, `openai`
- Whitespace: `igraph`, `leidenalg`, `umap-learn`, `scikit-learn`, `numpy`, `scipy`
- Alerts: `asyncpg`, `aiosmtplib`, `httpx`
- Optional PDF export: `reportlab`

---

## Environment variables

Backend (FastAPI):
- `DATABASE_URL` — e.g. `postgresql://USER:PASS@HOST/DB?sslmode=require`
- `CORS_ALLOW_ORIGINS` — CSV of allowed origins; defaults include localhost:3000 and Vercel/Render URLs
- `AUTH0_DOMAIN` — like `https://your-tenant.us.auth0.com`
- `AUTH0_API_AUDIENCE` — API Identifier expected in JWT `aud`
- `OPENAI_API_KEY` — required if generating embeddings during ETL or on-demand
- Optional ETL tuning: `EMBEDDING_MODEL`, `EMB_BATCH_SIZE`, `EMB_MAX_CHARS`
- Optional PDF: install `reportlab` to enable `/export?format=pdf`

Frontend (Next.js):
- `BACKEND_URL` — base URL of FastAPI (e.g. `https://patent-scout.onrender.com`)
- `NEXT_PUBLIC_AUTH0_DOMAIN`
- `NEXT_PUBLIC_AUTH0_CLIENT_ID`
- `NEXT_PUBLIC_AUTH0_AUDIENCE` — must match `AUTH0_API_AUDIENCE`

Alerts (Mailgun):
- `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`
- `MAILGUN_FROM_NAME` (default: Patent Scout Alerts)
- `MAILGUN_FROM_EMAIL` (default: alerts@<MAILGUN_DOMAIN>)

Auth mismatch tip: If audience/domain are incorrect, `/saved-queries` (and other protected routes) will return 401.

---

## Database schema (essentials)

Tables used by the app (subset):

- `patent(pub_id PK, title, abstract, claims_text, assignee_name, inventor_name jsonb, cpc jsonb, pub_date int, priority_date int, filing_date int, ...)`
- `patent_embeddings(pub_id FK→patent, model text, dim int, embedding vector, created_at timestamptz, cluster_id int, local_density real, whitespace_score real)`
- `app_user(id text, email citext, display_name text, created_at timestamptz)`
- `saved_query(id uuid, owner_id text FK→app_user, name text, filters jsonb, semantic_query text, schedule_cron text, is_active boolean, created_at, updated_at)`
- `alert_event(id uuid, saved_query_id uuid FK→saved_query, created_at timestamptz, results_sample jsonb, count int)`
- `knn_edge(src text, dst text, w real)` and `cluster_stats` (materialized view) — used by whitespace

Indexes: GIN on full-text, JSONB CPC, and pgvector indexes per `model` (e.g., `text-embedding-3-small|ta`, `...|claims`).

Optional claim search speedup: add a computed `search_vector` (title+abstract+claims) with a GIN index to efficiently search claims (see migration example below).

---

## Setup and run

1) Postgres
- Create a Postgres DB and enable the extension:
  `CREATE EXTENSION IF NOT EXISTS vector;`

2) Backend (FastAPI)
- Create a venv, install `requirements.txt`
- Set `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_API_AUDIENCE`, and (optionally) `OPENAI_API_KEY`
- Run locally: `uvicorn app.api:app --reload --port 8000`
- Open API docs at `http://localhost:8000/docs`

3) Frontend (Next.js)
- `npm install`
- Set `BACKEND_URL`, `NEXT_PUBLIC_AUTH0_*`
- Run: `npm run dev` → visit `http://localhost:3000`

Notes
- The frontend proxies API calls to the backend and forwards the `Authorization` header.
- By default, keyword search uses title + abstract; claims search can be enabled with the optional index below.

---

## ETL (load patents from BigQuery)

The ETL pulls US patents related to AI from the public BigQuery dataset, normalizes CPC, upserts to Postgres, and writes embeddings for two models: `...|ta` (title+abstract) and `...|claims` when enabled.

Prerequisites
- Google BigQuery access and project
- Postgres with `pgvector`
- `OPENAI_API_KEY` if you want real embeddings (otherwise, the code can fall back to deterministic hashes)

Example
```bash
python etl.py --project your-gcp-project --dsn "postgresql://user:pass@host/db" \
  --date-from 2024-01-01 --date-to 2024-01-31 --embed
```

Key flags
- `--date-from`, `--date-to` YYYY-MM-DD range
- `--embed` enable embedding writes
- `--claims` include claims text
- `--batch-size` upsert batch size
- `--dry-run` validate without writing

---

## API overview

Backend (FastAPI)
- `POST /search` — hybrid search by keywords + vector + filters
- `GET /saved-queries`, `POST /saved-queries`, `PATCH /saved-queries/{id}`, `DELETE /saved-queries/{id}`
- `GET /trend/volume` — trend aggregation (by month/year)
- `GET /patent/{pub_id}` — details
- `GET /patent-date-range` — min/max publication date
- `GET /export` — CSV or PDF of top results (PDF requires `reportlab`)
- `POST /whitespace/graph` — compute graph/scores and persist, returning nodes+edges

Frontend (Next.js proxies)
- `/api/search`, `/api/saved-queries`, `/api/saved-queries/[id]`
- `/api/trend/volume`, `/api/patent-date-range`, `/api/export`
- `/api/whitespace/graph`

Whitespace API contract
- Request: `{ date_from?: string, date_to?: string, neighbors?: number, resolution?: number, alpha?: number, beta?: number, limit?: number, layout?: boolean, focus_keywords?: string[], focus_cpc_like?: string[] }`
- Response: `{ nodes: { id, cluster_id, score, density, x, y }[], edges: { source, target, w }[] }`

---

## Alerts

Schema (current)
```sql
CREATE TABLE saved_query (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL,
  semantic_query text,
  schedule_cron text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_query_id uuid NOT NULL REFERENCES saved_query(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  results_sample jsonb NOT NULL,
  count integer NOT NULL
);
```

Run locally
```bash
python alerts_runner.py
```

Behavior
- Sends via Mailgun if configured; otherwise prints to stdout
- Only reports results newer than the last run per saved query
- Schedule with Render Cron or any scheduler

---

## Whitespace graph (Sigma + Graphology)

- Component: `components/SigmaWhitespaceGraph.tsx` (dynamically imported to avoid SSR/WebGL issues)
- API: `POST /api/whitespace/graph` → forwards to FastAPI `/whitespace/graph`
- Rendering
  - Node size = whitespace score; node color = cluster
  - Edge weight = similarity; optional client-side ForceAtlas2 refinement

Local try
```bash
npm install
npm run dev
```

Then open the Whitespace page, fill parameters, and click “Run Analysis”.

---

## Docker

The provided `Dockerfile` builds the FastAPI service (Python slim base, installs `requirements.txt`, runs `uvicorn app.api:app`). Set `PORT` and required env vars. For multi-service deployment (frontend + backend), deploy Next.js separately (e.g., Vercel) and set `BACKEND_URL`.

---

## License

This repository is publicly viewable for portfolio purposes only. The code is proprietary.
Copyright © 2025 Phaethon Order LLC. All rights reserved. 
Contact [support@phaethon.llc](mailto:support@phaethon.llc) for licensing or reuse requests.

See [LICENSE](LICENSE)

Note: `package.json` may list a different license string; the authoritative license for this repository is proprietary.

---

## Contact

Questions or support: [support@phaethon.llc](mailto:support@phaethon.llc).