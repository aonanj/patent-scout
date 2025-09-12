# app.py
import os, numpy as np
import asyncpg
from fastapi import FastAPI
from pydantic import BaseModel

DATABASE_URL = os.environ["DATABASE_URL"]
app = FastAPI()

class SearchReq(BaseModel):
    keywords: str | None = None
    qvec: list[float] | None = None

@app.on_event("startup")
async def startup():
    app.state.db = await asyncpg.connect(DATABASE_URL)

@app.post("/search")
async def search(req: SearchReq):
    db = app.state.db
    if req.qvec is None:
        qvec = [0.0]*1536
    else:
        qvec = list(req.qvec)
    rows = await db.fetch("""
    WITH kw AS (
      SELECT id, 1.0 AS score
      FROM patent
      WHERE ($1::text IS NULL) OR
            to_tsvector('english', coalesce(title,'')||' '||coalesce(abstract,'')) @@ plainto_tsquery('english', $1)
      LIMIT 200
    ),
    vec AS (
      SELECT p.id, 1.0/(1e-6 + (e.embedding <-> $2::vector)) AS score
      FROM patent_embeddings e JOIN patent p ON p.id=e.patent_id
      LIMIT 200
    )
    SELECT p.id, p.title,
           coalesce(k.score,0)*0.4 + coalesce(v.score,0)*0.6 AS hybrid_score
    FROM patent p
    LEFT JOIN kw k USING (id)
    LEFT JOIN vec v USING (id)
    WHERE ($1::text IS NOT NULL AND coalesce(k.score,0)>0)
       OR ($1::text IS NULL AND coalesce(v.score,0)>0)
    ORDER BY hybrid_score DESC
    LIMIT 20;
    """, req.keywords, qvec)
    return [dict(r) for r in rows]
