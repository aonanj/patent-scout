# app.py
import os
import asyncpg
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager

DATABASE_URL = os.environ["DATABASE_URL"]

class SearchReq(BaseModel):
    keywords: Optional[str] = None
    qvec: Optional[List[float]] = None
    cpc_any: Optional[List[str]] = None

HYBRID_SQL = """
WITH kw AS (
  SELECT id, 1.0 AS score
  FROM patent p
  WHERE ($1::text IS NULL) OR
        to_tsvector('english', coalesce(title,'')||' '||coalesce(abstract,'')) @@ plainto_tsquery('english', $1)
    AND (
         $3::text[] IS NULL OR EXISTS (
           SELECT 1 FROM unnest($3::text[]) q WHERE p.cpc ? q
         )
    )
  LIMIT 200
),
vec AS (
  SELECT p.id, 1.0/(1e-6 + (e.embedding <-> $2::vector)) AS score
  FROM patent_embeddings e
  JOIN patent p ON p.id=e.patent_id
  WHERE (
         $3::text[] IS NULL OR EXISTS (
           SELECT 1 FROM unnest($3::text[]) q WHERE p.cpc ? q
         )
  )
  LIMIT 200
)
SELECT p.id, p.title,
       coalesce(k.score,0)*0.4 + coalesce(v.score,0)*0.6 AS hybrid_score
FROM patent p
LEFT JOIN kw k USING (id)
LEFT JOIN vec v USING (id)
WHERE coalesce(k.score,0)>0 OR coalesce(v.score,0)>0
ORDER BY hybrid_score DESC
LIMIT 20;
"""

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=1,
        max_size=5,
        command_timeout=30,
        timeout=30,
        max_inactive_connection_lifetime=300,  # recycle idle conns
    )
    try:
        yield
    finally:
        await app.state.pool.close()

app = FastAPI(docs_url="/docs", openapi_url="/openapi.json", lifespan=lifespan)

@app.get("/")
async def root():
    return {"ok": True}

@app.get("/health")
async def health():
    async with app.state.pool.acquire() as conn:
        v = await conn.fetchval("SELECT 1;")
    return {"status": "ok", "db": v}

@app.post("/search")
async def search(req: SearchReq):
    # 1) build 1536-d vector
    qvec = (req.qvec or [])
    if len(qvec) < 1536:
        qvec = qvec + [0.0] * (1536 - len(qvec))
    elif len(qvec) > 1536:
        qvec = qvec[:1536]

    # 2) convert to pgvector text literal
    vec_literal = "[" + ",".join(f"{float(x):.6f}" for x in qvec) + "]"

    # 3) run query; NOTE the ::text::vector cast
    async with app.state.pool.acquire() as conn:
        rows = await conn.fetch(
            HYBRID_SQL,                 # unchanged except param 2 cast
            req.keywords,               # $1
            vec_literal,                # $2 (text)
            req.cpc_any or None,        # $3 (text[] or NULL)
        )
    return [dict(r) for r in rows]


# FastAPI additions
@app.get("/patent/{pid}")
async def patent_detail(pid: str):
    q = """SELECT id, pub_date, title, abstract, assignee, cpc
           FROM patent WHERE id=$1"""
    return await app.state.db.fetchrow(q, pid)

@app.get("/trend/volume")
async def trend_volume():
    q = """SELECT date_trunc('month', pub_date)::date AS month, COUNT(*) AS n
           FROM patent GROUP BY 1 ORDER BY 1"""
    return [dict(r) for r in await app.state.db.fetch(q)]
