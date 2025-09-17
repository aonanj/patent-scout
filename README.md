# Patent Scout

Search, volume trend, and alerting on AI-related patents and publications using Postgres (Neon/Supabase), pgvector, FastAPI, and a Next.js frontend.

- **Hybrid search**: full-text (Postgres GIN) + vector similarity (pgvector)
- **ETL**: directly query BigQuery patents dataset, generate embeddings (OpenAI or deterministic hash fallback), and build indexes
- **FastAPI backend**: `/search`, `/saved-queries`, `/trend/volume`
- **Alerts runner**: scheduled job sends email digests via Mailgun
- **Frontend**: Next.js app (App Router) with `/api/search` and `/api/saved-queries` proxy routes, and a simple search + “Save as Alert” UI
- **Deployments**: Render (Web Service) and Vercel. See [https://patent-scout.vercel.app/](https://patent-scout.vercel.app/)

---

## Screenshots

### Next.js Search UI
![Search UI](docs/screenshots/search-ui.png)

### FastAPI Swagger Docs
![API Docs](docs/screenshots/api-docs.png)

---

## What’s inside

- `etl.py` — ETL and ingestion script that creates the DB schema, upserts patents, and generates embeddings. Handles CPC parsing and indexing.
- `app/api.py` — FastAPI application wiring routes and startup; uses repository helpers for search and trends.
- `app/repository.py` — Database query layer: hybrid search (keyword + pgvector), trends, and detail fetches.
- `app/embed.py` — Embedding helper (OpenAI wrapper) used to produce semantic vectors.
- `app/db.py` — Database connection / pool helpers used by the API and ETL.
- `app/schemas.py` — Pydantic models for requests/responses (SearchRequest, PatentHit, PatentDetail, etc.).
- `app/page.tsx` — Next.js frontend search UI: keyword, CPC, date filters, results and trend chart.
- `app/api/search/route.ts` — Next.js server route that proxies frontend search requests to the FastAPI backend.
- `app/api/saved-queries/route.ts` and `app/api/saved-queries/[id]/route.ts` — Proxy routes for saved-query CRUD used by the UI.
- `alerts_runner.py` — Background/cron runner that evaluates saved queries, records alert events, and sends digests (Mailgun or stdout).

---

## Requirements

- Python 3.12+ (project uses modern typing and was tested on 3.13+)
- A Postgres database with `pgvector` (Neon or Supabase recommended)
- Node.js 18+ and Next.js 15+ (for frontend)

Python packages (see `pyproject.toml` / `requirements.txt`):
- Runtime: `fastapi`, `uvicorn`, `psycopg[binary,pool]`, `pydantic`, `httpx`, `python-dotenv`
- ETL: `psycopg2-binary`, `google-cloud-bigquery`, `tqdm`, `tenacity`, `openai`
- Alerts: `asyncpg`, `aiosmtplib`
- Optional: `openai` (for embeddings)

---

## Setup

### 1. Database
- Create a Neon or Supabase Postgres database
- Ensure `pgvector` is available (`CREATE EXTENSION vector;`)

Notes on full-text search and performance
- By default the keyword search used by `/search` and the frontend searches the `title` and `abstract` fields (this provides a good balance of relevance and performance). Searching the full `claims_text` can be very slow unless you precompute a tsvector column and add a GIN index. See the "Claims indexing" section below if you want to enable claims searching.

### 2. Environment variables
In `.env` or Render dashboard:

- `DATABASE_URL` — e.g. `postgresql://USER:PASS@HOST/DB?sslmode=require`

Optional Mailgun (for alerts):
- `MAILGUN_DOMAIN`
- `MAILGUN_API_KEY`
- `MAILGUN_FROM_NAME` (default: Patent Scout Alerts)
- `MAILGUN_FROM_EMAIL` (default: alerts@<MAILGUN_DOMAIN>)

Optional OpenAI (for embeddings):
- `OPENAI_API_KEY`

Optional Next.js:
- `BACKEND_URL` — FastAPI base URL (e.g. `https://patent-scout.onrender.com`)

---

## ETL (Load patents)

The ETL script directly queries Google BigQuery's public patents dataset and loads into Postgres.

Prerequisites:
- Google Cloud BigQuery access (set `BQ_PROJECT` env var or `--project`)
- Postgres database with `pgvector` extension

Run ETL:

```bash
python etl.py --project your-bigquery-project --dsn "postgresql://user:pass@host/db" --date-from 2024-01-01 --date-to 2024-01-31
```

Options:
- `--date-from` / `--date-to`: Date range (YYYY-MM-DD)
- `--embed`: Generate embeddings (requires OpenAI API key)
- `--claims`: Include claims text in ingestion
- `--batch-size`: Batch size for upserts (default 800)
- `--dry-run`: Preview without writing to DB

- Upserts into `patent` + `patent_embeddings`
- Creates GIN full-text index for title/abstract, CPC jsonb GIN index, and vector index for embeddings when possible
- Falls back to deterministic hash embeddings if OpenAI is not configured

---

## FastAPI backend

Start locally:

```bash
# From repo root, activate your venv then run:
uvicorn app.api:app --reload --port 8000
```

Endpoints:
- `POST /search` — hybrid keyword/vector/CPC search
- `GET /saved-queries` — list
- `POST /saved-queries` — create
- `DELETE /saved-queries/{id}` — delete
- `GET /trend/volume` — volume trends
- `GET /patent/{pub_id}` — patent details
- `/docs` — Swagger UI

---

## Alerts

Schema:

```sql
CREATE TABLE saved_query (
  id           bigserial PRIMARY KEY,
  owner_id     text NOT NULL,
  name         text NOT NULL,
  filters      jsonb,    -- SearchFilters as JSON
  semantic_query text,
  schedule_cron text,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE alert_event (
  id              bigserial PRIMARY KEY,
  saved_query_id  bigint REFERENCES saved_query(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  result_count    int,
  results_sample  jsonb
);
```

Run manually:

```bash
python alerts_runner.py
```

- If Mailgun env vars set → sends email digests
- If not, prints email content to stdout
- Only includes new results since last run

Schedule on Render as a Cron Job or use GitHub Actions.

---

## Next.js frontend

- `app/page.tsx` — search UI with keyword + CPC input, results list, and “Save as Alert”
- `app/api/search/route.ts` — proxies to backend `/search`
- `app/api/saved-queries/route.ts` — proxies CRUD to backend

Run locally:

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

Frontend note: The UI sends keyword searches to the backend and the backend searches `title` and `abstract` by default. If you enable the optional claims tsvector/index below, the backend can be switched to search that combined vector instead (improves recall at the cost of additional storage/index time).

---

## Deployment (Render)

1. Push repo to GitHub.
2. Render → New Web Service:
  - Build Command: `pip install -r requirements.txt`
  - Start Command: `uvicorn app.api:app --host 0.0.0.0 --port $PORT`
  - Env Vars: set `DATABASE_URL`, `MAILGUN_*`.
3. Render → New Cron Job:
  - Command: `python alerts_runner.py`
  - Schedule: `0 14 * * *`
  - Env Vars: same as web service.
4. Deploy Next.js frontend on Vercel or Render. Set `BACKEND_URL` to FastAPI URL.

## Claims indexing (optional)

If you want `/search` to also include `claims_text` efficiently, add a computed tsvector column and a GIN index. Example migration (Postgres):

```sql
ALTER TABLE patent
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
   setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
   setweight(to_tsvector('english', coalesce(abstract, '')), 'B') ||
   setweight(to_tsvector('english', coalesce(claims_text, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS patent_search_vector_idx ON patent USING GIN (search_vector);
```

Then change repository queries to use `search_vector @@ plainto_tsquery('english', %s)` and `ts_rank_cd(search_vector, plainto_tsquery(...))` to restore claims searching without large runtime scans.

This approach increases storage and index time but keeps queries fast.

---

## License

This project is licensed under the AGPLv3 License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Contact

For issues and questions, please contact [phaethon@phaethon.llc](mailto:phaethon@phaethon.llc). 
