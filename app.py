# app.py
import os
import asyncpg
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel

DATABASE_URL = os.environ["DATABASE_URL"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create DB connection
    app.state.db = await asyncpg.connect(DATABASE_URL)
    try:
        yield
    finally:
        # Shutdown: close DB connection
        await app.state.db.close()


app = FastAPI(lifespan=lifespan)

class SearchReq(BaseModel):
    keywords: str | None = None
    qvec: list[float] | None = None

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

