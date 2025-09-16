from __future__ import annotations

from typing import Annotated, Sequence, cast

import psycopg
from fastapi import Depends, FastAPI, HTTPException
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
)

app = FastAPI(title="Patent Scout API", version="0.1.0")
Conn = Annotated[psycopg.AsyncConnection, Depends(get_conn)]


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


@app.get("/patent/{pub_id}", response_model=PatentDetail)
async def get_detail(pub_id: str, conn: Conn) -> PatentDetail:
    detail = await get_patent_detail(conn, pub_id)
    if not detail:
        raise HTTPException(status_code=404, detail="not found")
    return detail
