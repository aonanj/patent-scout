# Patent Scout

Lightweight patent search and alerting using Postgres (Neon/Supabase), pgvector, and FastAPI.

- Hybrid search: full‑text (Postgres GIN) + vector similarity (pgvector)
- Simple ETL to load patents from CSV or sample data and (optionally) create OpenAI embeddings
- Minimal FastAPI service with a single `/search` endpoint
- Scheduled email alerts for saved queries via Mailgun (or console print when not configured)

This repo is intentionally small: a few scripts that get you from zero to a working demo fast, and are easy to extend.

## What’s inside

- `etl_patents_neon.py` — Creates schema and loads patents. Adds embeddings (OpenAI or deterministic hash fallback). Builds indexes.
- `app.py` — FastAPI service exposing `/search` with hybrid ranking.
- `alerts_runner.py` — Executes saved alerts, records events, sends email summaries.
- `us_patents.csv` — Optional CSV input (id,title,abstract,assignee,pub_date,cpc_codes).

## Requirements

- Python 3.10+
- A Postgres with pgvector extension (Neon or Supabase recommended)

Python packages (see below for `requirements.txt` if you add one):

- Runtime: fastapi, uvicorn, asyncpg, pydantic, numpy, httpx, python-dotenv
- ETL: psycopg2-binary, tqdm
- Optional: openai (for real embeddings)

## Setup

1) Create a Postgres database (Neon/Supabase/etc.). Ensure the `vector` extension is available.

2) Set environment variables (create a `.env` if you like):

- `DATABASE_URL` — e.g. `postgresql://USER:PASS@HOST/DB?sslmode=require`
- Optional Mailgun (for alerts):
  - `MAILGUN_DOMAIN` — e.g. `mg.your-domain.com`
  - `MAILGUN_API_KEY`
  - `MAILGUN_FROM_NAME` (default: `Patent Scout Alerts`)
  - `MAILGUN_FROM_EMAIL` (default: `alerts@<MAILGUN_DOMAIN>`) 
  - `MAILGUN_BASE_URL` (default: `https://api.mailgun.net/v3`)
- Optional OpenAI (for embeddings):
  - `OPENAI_API_KEY`

If you use a `.env` file, `dotenv` is already imported in the scripts to auto-load it.

## Load data (ETL)

You can load the provided sample rows or your own CSV.

- Use sample rows (3 demo patents):

```bash
python etl_patents_neon.py
```

- Load a CSV:

```bash
python etl_patents_neon.py --csv us_patents.csv --limit 1000
```

- Choose embeddings provider:

```bash
# Force OpenAI (requires OPENAI_API_KEY); falls back to hash if it fails
python etl_patents_neon.py --provider openai

# Deterministic hash embeddings (no external calls)
python etl_patents_neon.py --provider hash
```

The ETL will:
- Create tables: `patent`, `patent_embeddings`
- Add indexes: full‑text on title+abstract, GIN on CPC jsonb, optional IVF Flat on embeddings
- Upsert rows and embeddings
- Print a couple of quick smoke query results

CSV format:

```
id,title,abstract,assignee,pub_date,cpc_codes
US-20240123456-A1,Title...,Abstract...,Company,2024-06-06,"G06F/16;G06N/20"
```

CPC codes are semicolon‑delimited and stored as a JSON array.

## Run the API

The app exposes a single POST endpoint: `/search`.

Request body:

```json
{
  "keywords": "edge AI",
  "qvec": [0.0, 0.1, ... 1536 floats ...]
}
```

- If `keywords` is provided, a text search over title+abstract is used.
- If `keywords` is omitted/null, vector similarity is used.
- If `qvec` is omitted, a zero vector is used (mostly for demo).

Hybrid scoring is a weighted mix of keyword and vector scores when both are present.

Run the server locally (example with uvicorn):

```bash
uvicorn app:app --reload --port 8000
```

Try it:

```bash
curl -X POST http://127.0.0.1:8000/search \
  -H 'content-type: application/json' \
  -d '{"keywords":"inference"}'
```

## Alerts (email digests)

Alerts are defined in a simple table `saved_query` and executions are recorded in `alert_event`.

Schema (created on first run if missing):

```sql
CREATE TABLE IF NOT EXISTS saved_query (
  id           bigserial PRIMARY KEY,
  user_email   text NOT NULL,
  name         text,
  keywords     text,
  assignee     text,
  cpc          jsonb,   -- JSON array of CPC codes ["G06F/16", ...]
  date_from    date,
  date_to      date,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_event (
  id              bigserial PRIMARY KEY,
  saved_query_id  bigint REFERENCES saved_query(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  result_count    int,
  results_sample  jsonb
);
```

Run alerts:

```bash
python alerts_runner.py
```

- If Mailgun creds are set, emails are sent.
- If not, the email contents are printed to stdout.
- Only patents newer than the previous alert run are included per saved query.

Tip: add to cron for daily digests.

## Design notes

- Postgres handles both full‑text and vector similarity; no external search service needed.
- CPC codes are stored as a JSONB array with a GIN index; the sample queries use `cpc ? 'CODE'` and a simple "match any" filter for alerts.
- Embeddings default to a deterministic hash so the project works offline; switch to OpenAI for better quality.

## Troubleshooting

- `psycopg2` install issues: prefer `psycopg2-binary` for local dev. For production, compile `psycopg2` from source.
- `vector` extension missing: ensure your Postgres supports `pgvector` and run `CREATE EXTENSION vector;`.
- "No rows" after ETL: confirm `DATABASE_URL`, and that your CSV headers match the expected names.

## License

MIT (see LICENSE if provided).