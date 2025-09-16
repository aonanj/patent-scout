# Patent Scout

Lightweight patent search and alerting using Postgres (Neon/Supabase), pgvector, FastAPI, and a Next.js frontend.

- **Hybrid search**: full-text (Postgres GIN) + vector similarity (pgvector)
- **ETL**: load patents from CSV or BigQuery export, generate embeddings (OpenAI or deterministic hash fallback), and build indexes
- **FastAPI backend**: `/search`, `/saved-queries`, `/alerts`
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

- Python 3.11+ (project uses modern typing and was tested on 3.13+)
- A Postgres database with `pgvector` (Neon or Supabase recommended)
- Node.js 18+ and Next.js 13+ (for frontend)

Python packages (see `pyproject.toml` / `requirements.txt`):
- Runtime: `fastapi`, `uvicorn`, `psycopg[binary,pool]` (or `asyncpg`), `pydantic`, `httpx`, `python-dotenv`
- ETL: `psycopg2-binary` or `psycopg[binary]`, `tqdm`
- Optional: `openai` (for real embeddings)

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

Export from BigQuery:

```sql
SELECT
  publication_number AS id,
  title_localized[SAFE_OFFSET(0)].text AS title,
  abstract_localized[SAFE_OFFSET(0)].text AS abstract,
  assignee_harmonized[SAFE_OFFSET(0)].name AS assignee,
  CAST(publication_date AS STRING) AS pub_date,
  STRING_AGG(DISTINCT c.code, ';' ORDER BY c.code) AS cpc_codes
FROM `patents-public-data.patents.publications`
LEFT JOIN UNNEST(cpc) AS c
WHERE country_code = 'US'
  AND publication_date >= 20240101
GROUP BY id, title, abstract, assignee, pub_date
LIMIT 5000;
```

Save as `us_patents_with_cpc.csv`.

Run ETL:

```bash
python etl_patents_neon.py --csv us_patents_with_cpc.csv --limit 5000 --provider openai
```

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
- `GET /alerts` — list recent alert events
- `GET /health` — health check
- `/docs` — Swagger UI

---

## Alerts

Schema:

```sql
CREATE TABLE saved_query (... cpc jsonb ...);
CREATE TABLE alert_event (...);
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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Contact

For issues and questions, please contact [phaethon@phaethon.llc](mailto:phaethon@phaethon.llc). 
