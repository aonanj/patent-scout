from __future__ import annotations

from typing import Annotated, Sequence, Optional, Dict, Any, cast

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import asyncio
import inspect

from .db import get_conn, init_pool
from .repository import get_patent_detail, search_hybrid, trend_volume
from .embed import embed as embed_text
from .schemas import (
    PatentDetail,
    SearchRequest,
    SearchResponse,
    TrendPoint,
    TrendRequest,
    TrendResponse,
    SearchFilters,
)

app = FastAPI(title="Patent Scout API", version="0.1.0")
Conn = Annotated[psycopg.AsyncConnection, Depends(get_conn)]
origins = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()] or [
    "http://localhost:3000",
    "https://patent-scout.onrender.com",
    "https://patent-scout.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    # Initialize pool at startup for early failure if misconfigured.
    init_pool()


@app.post("/search", response_model=SearchResponse)
async def post_search(req: SearchRequest, conn: Conn) -> SearchResponse:
    qv: list[float] | None = None
    if req.semantic_query:
        maybe = embed_text(req.semantic_query)
        if inspect.isawaitable(maybe):
            qv = cast(list[float], await maybe)
        else:
            qv = list(cast(Sequence[float], maybe))
    total, items = await search_hybrid(
        conn,
        keywords=req.keywords,
        query_vec=qv,
        limit=max(1, min(req.limit, 200)),
        offset=max(0, req.offset),
        filters=req.filters,
    )
    return SearchResponse(total=total, items=items)


@app.post("/trend/volume", response_model=TrendResponse)
async def post_trend(req: TrendRequest, conn: Conn) -> TrendResponse:
    rows = await trend_volume(conn, group_by=req.group_by, filters=req.filters)
    points: list[TrendPoint] = [TrendPoint(bucket=b, count=int(c)) for b, c in rows]
    return TrendResponse(points=points)

def _dtint(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    # accepts YYYY-MM-DD or YYYYMMDD
    t = s.replace("-", "")
    return int(t) if t.isdigit() and len(t) == 8 else None

@app.get("/trend/volume")
async def trend_volume_get(
    group_by: str = Query("month", pattern="^(month|cpc|assignee|applicant)$"),
    q: Optional[str] = None,
    assignee: Optional[str] = None,
    cpc: Optional[str] = None,
    date_from: Optional[str] = None,  # "YYYY-MM-DD" or "YYYYMMDD"
    date_to: Optional[str] = None,
):
    filters = SearchFilters(
        assignee=assignee,
        cpc=cpc,
        date_from=_dtint(date_from),
        date_to=_dtint(date_to),
    )

    # Replace with your repo's pool/connection helper if you have one.
    dsn = os.getenv("DATABASE_URL", "")
    async with (await psycopg.AsyncConnection.connect(dsn)) as conn:
        rows: list[tuple[str, int]] = await trend_volume(
            conn, group_by=group_by, filters=filters
        )

    return {"points": [{"date": k, "count": v} for (k, v) in rows]}


@app.get("/patent/{pub_id}", response_model=PatentDetail)
async def get_detail(pub_id: str, conn: Conn) -> PatentDetail:
    detail = await get_patent_detail(conn, pub_id)
    if not detail:
        raise HTTPException(status_code=404, detail="not found")
    return detail
