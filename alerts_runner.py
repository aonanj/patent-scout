#!/usr/bin/env python3
"""
alerts_runner.py
- Executes saved alerts against Neon/Supabase Postgres
- Sends emails via Mailgun HTTP API
- Filters by keywords, assignee, CPC codes, and date window
- Only reports NEW results since the last run per saved_query

Install:
  pip install asyncpg httpx python-dotenv

Env:
  DATABASE_URL="postgresql://USER:PASS@HOST/DB?sslmode=require"

  MAILGUN_DOMAIN="mg.your-domain.com"
  MAILGUN_API_KEY="key-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  MAILGUN_FROM_NAME="Patent Scout Alerts"
  MAILGUN_FROM_EMAIL="alerts@your-domain.com"
  # Optional:
  MAILGUN_BASE_URL="https://api.mailgun.net/v3"  # default

DB schema (run once):
  CREATE TABLE IF NOT EXISTS saved_query (
    id           bigserial PRIMARY KEY,
    user_email   text NOT NULL,
    name         text,
    keywords     text,     -- plainto_tsquery on title+abstract
    assignee     text,     -- exact match; normalize upstream if needed
    cpc          jsonb,    -- JSON array of CPC codes, e.g. ["G06F/16","G06N/20"]
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
"""
import os
import json
import asyncio
from typing import Optional

import asyncpg
import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

DB_URL = os.getenv("DATABASE_URL")

MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN")
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_FROM_NAME = os.getenv("MAILGUN_FROM_NAME", "Patent Scout Alerts")
MAILGUN_FROM_EMAIL = os.getenv(
    "MAILGUN_FROM_EMAIL",
    f"alerts@{MAILGUN_DOMAIN}" if MAILGUN_DOMAIN else "alerts@example.com"
)
MAILGUN_BASE_URL = os.getenv("MAILGUN_BASE_URL", "https://api.mailgun.net/v3")


def _from_header() -> str:
    return f"{MAILGUN_FROM_NAME} <{MAILGUN_FROM_EMAIL}>"


async def send_mailgun_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    # If Mailgun is not configured, no-op with console output.
    if not (MAILGUN_DOMAIN and MAILGUN_API_KEY):
        print("[info] Mailgun not configured; printing email:")
        print("To:", to_email)
        print("Subject:", subject)
        print(text_body)
        return

    url = f"{MAILGUN_BASE_URL}/{MAILGUN_DOMAIN}/messages"
    data = {
        "from": _from_header(),
        "to": [to_email],
        "subject": subject,
        "text": text_body,
    }
    if html_body:
        data["html"] = html_body

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, auth=("api", MAILGUN_API_KEY), data=data)
        if resp.status_code >= 300:
            print(f"[error] Mailgun send failed: {resp.status_code} {resp.text}")


def _where_clause() -> str:
    # CPC filter expects saved_query.cpc = JSON array of codes, e.g. ["G06F/16","G06N/20"]
    # We treat it as "match any" of the provided codes using the `?` jsonb key-existence operator.
    return """
      WHERE ($1::text IS NULL OR
             to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.abstract,'')) @@ plainto_tsquery('english', $1))
        AND ($2::text IS NULL OR p.assignee = $2)
        AND (
              $3::jsonb IS NULL
              OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text($3) AS q(code)
                    WHERE p.cpc ? q.code
                 )
            )
        AND ($4::date IS NULL OR p.pub_date >= $4)
        AND ($5::date IS NULL OR p.pub_date <= $5)
    """


SEARCH_SQL_NEW = f"""
WITH last_run AS (
  SELECT sq.id AS saved_query_id,
         COALESCE(MAX(ae.created_at), TIMESTAMPTZ '1970-01-01') AS ts
  FROM saved_query sq
  LEFT JOIN alert_event ae ON ae.saved_query_id = sq.id
  GROUP BY sq.id
)
SELECT p.pub_id, p.title, p.pub_date
FROM patent p
JOIN last_run lr ON lr.saved_query_id = $6
{_where_clause()}
  AND p.pub_date > (lr.ts AT TIME ZONE 'UTC')::date
ORDER BY p.pub_date DESC
LIMIT 200;
"""


async def run_one(conn: asyncpg.Connection, sq: asyncpg.Record) -> int:
    params = (
        sq["keywords"],                                # $1
        sq["assignee"],                                # $2
        json.dumps(sq["cpc"]) if sq["cpc"] else None,  # $3
        sq["date_from"],                                # $4
        sq["date_to"],                                  # $5
        sq["id"],                                       # $6
    )
    rows = await conn.fetch(SEARCH_SQL_NEW, *params)
    count = len(rows)
    if count == 0:
        return 0

    sample = [dict(id=r["pub_id"], title=r["title"], pub_date=str(r["pub_date"])) for r in rows[:10]]

    await conn.execute(
        "INSERT INTO alert_event(saved_query_id, result_count, results_sample) VALUES ($1,$2,$3)",
        sq["id"], count, json.dumps(sample)
    )

    name = sq["name"] or "Saved Query"
    lines = [f"{r['pub_date']}  {r['pub_id']}  {r['title']}" for r in sample]
    text = (
        f"Alert: {name}\n"
        f"Total new results: {count}\n\n"
        + "\n".join(lines)
        + "\n\n(Showing up to 10. See app for full list.)"
    )
    html = (
        f"<h3>Alert: {name}</h3>"
        f"<p>Total new results: <b>{count}</b></p>"
        "<ol>"
        + "".join(f"<li>{r['pub_date']} &nbsp; <b>{r['pub_id']}</b> — {r['title']}</li>" for r in sample)
        + "</ol><p>(Showing up to 10. See app for full list.)</p>"
    )
    await send_mailgun_email(sq["user_email"], f"Patent Scout Alert: {name}", text, html)
    return count


async def main():
    conn = await asyncpg.connect(DB_URL)
    try:
        saved = await conn.fetch("SELECT * FROM saved_query ORDER BY id")
        total = 0
        for sq in saved:
            try:
                total += await run_one(conn, sq)
            except Exception as e:
                print(f"[error] saved_query id={sq['id']}: {e}")
        print(f"[done] total new results across alerts: {total}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
