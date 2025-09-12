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

### Save Alert UI
![Save Alert](docs/screenshots/save-alert.png)

### FastAPI Swagger Docs
![API Docs](docs/screenshots/api-docs.png)

---

## What’s inside

- `etl_patents_neon.py` — Creates schema and loads patents. Handles CPC codes, embeddings, and indexes.
- `app.py` — FastAPI service exposing `/search`, `/saved-queries`, `/alerts`, and health endpoints.
- `alerts_runner.py` — Executes saved alerts, records events, sends Mailgun email digests.
- `app/page.tsx` — Next.js UI with keyword + CPC search and “Save as Alert” button.
- `app/api/search/route.ts` — Proxies frontend `/api/search` to FastAPI backend.
- `app/api/saved-queries/route.ts` and `[id]/route.ts` — Proxies saved query CRUD to FastAPI backend.
- `us_patents_with_cpc.csv` — Example CSV export from BigQuery (id,title,abstract,assignee,pub_date,cpc_codes).

---

## Requirements

- Python 3.10+
- A Postgres database with `pgvector` (Neon or Supabase recommended)
- Node.js 18+ and Next.js 13+ (for frontend)

Python packages:
- Runtime: `fastapi`, `uvicorn`, `asyncpg`, `pydantic`, `numpy`, `httpx`, `python-dotenv`
- ETL: `psycopg2-binary`, `tqdm`
- Optional: `openai` (for real embeddings)

---

## Setup

### 1. Database
- Create a Neon or Supabase Postgres database
- Ensure `pgvector` is available (`CREATE EXTENSION vector;`)

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
- Creates GIN full-text index, CPC jsonb GIN index, IVF Flat index
- Falls back to deterministic hash embeddings if OpenAI is not configured

---

## FastAPI backend

Start locally:

```bash
uvicorn app:app --reload --port 8000
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

---

## Deployment (Render)

1. Push repo to GitHub.
2. Render → New Web Service:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - Env Vars: set `DATABASE_URL`, `MAILGUN_*`.
3. Render → New Cron Job:
   - Command: `python alerts_runner.py`
   - Schedule: `0 14 * * *`
   - Env Vars: same as web service.
4. Deploy Next.js frontend on Vercel or Render. Set `BACKEND_URL` to FastAPI URL.

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
