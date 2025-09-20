from __future__ import annotations

import inspect
import os
from collections.abc import Sequence
from typing import Annotated, Any, cast

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from psycopg.types.json import Json
from pydantic import BaseModel

from .auth import get_current_user
from .db import get_conn, init_pool
from .embed import embed as embed_text
from .repository import get_patent_detail, search_hybrid, trend_volume
from .schemas import (
    PatentDetail,
    SearchFilters,
    SearchRequest,
    SearchResponse,
    TrendPoint,
    TrendResponse,
)

app = FastAPI(title="Patent Scout API", version="0.1.0")
Conn = Annotated[psycopg.AsyncConnection, Depends(get_conn)]
User = Annotated[dict, Depends(get_current_user)]
origins = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()] or [
    "http://localhost:3000",
    "https://patent-scout.onrender.com",
    "https://patent-scout.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

class DateRangeReponse(BaseModel):
    min_date: int | None  # YYYYMMDD
    max_date: int | None  # YYYYMMDD


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


# ----------------------------- Saved Queries -----------------------------
class SavedQueryCreate(BaseModel):
    name: str
    filters: dict[str, Any]
    semantic_query: str | None = None
    schedule_cron: str | None = None
    is_active: bool = True


@app.get("/saved-queries")
async def list_saved_queries(conn: Conn, user: User):

    owner_id = user.get("sub")
    if owner_id is None:
        raise HTTPException(status_code=400, detail="user missing sub claim")
    

    sql = (
        "SELECT id, owner_id, name, filters, semantic_query, schedule_cron, is_active, created_at, updated_at "
        "FROM saved_query "
        "WHERE owner_id = %s "
        "ORDER BY created_at DESC NULLS LAST, name ASC"
    )
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, [owner_id])  
        rows = await cur.fetchall()
    return {"items": rows}


@app.post("/saved-queries")
async def create_saved_query(req: SavedQueryCreate, conn: Conn, user: User):
    """Create a saved query.
    """
    owner_id = user.get("sub")
    if not owner_id:
        raise HTTPException(status_code=400, detail="user missing sub claim")


    insert_sq_sql = (
        "INSERT INTO saved_query (owner_id, name, filters, semantic_query, schedule_cron, is_active) "
        "VALUES (%s,%s,%s,%s,%s,%s) RETURNING id"
    )
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                insert_sq_sql,
                [
                    owner_id,
                    req.name,
                    Json(req.filters),
                    req.semantic_query,
                    req.schedule_cron,
                    req.is_active,
                ],
            )
            row = await cur.fetchone()
        return {"id": row[0] if row else None}
    except psycopg.Error as e:  # unique violation, FK errors, etc.
        raise HTTPException(status_code=400, detail=str(e).split("\n")[0]) from e


@app.delete("/saved-queries/{id}")
async def delete_saved_query(id: str, conn: Conn, user: User):
    """Delete a saved query owned by the current user.

    Requires authentication and enforces ownership in the DELETE statement.
    """
    owner_id = user.get("sub")
    if owner_id is None:
        raise HTTPException(status_code=400, detail="user missing sub claim")

    async with conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM saved_query WHERE id = %s AND owner_id = %s",
            [id, owner_id],  # type: ignore[arg-type]
        )
        deleted = cur.rowcount if hasattr(cur, "rowcount") else None  # type: ignore[attr-defined]
    # If nothing was deleted, either it doesn't exist or user doesn't own it
    if not deleted:
        raise HTTPException(status_code=404, detail="saved query not found")
    return {"deleted": deleted}


# app/api.py

@app.get("/trend/volume", response_model=TrendResponse)
async def get_trend(
    conn: Conn,
    group_by: str = Query(...),
    q: str | None = Query(None),
    assignee: str | None = Query(None),
    cpc: str | None = Query(None),
    date_from: int | None = Query(None),
    date_to: int | None = Query(None),
    semantic_query: str | None = Query(None),
) -> TrendResponse:
    qv: list[float] | None = None
    if semantic_query:
        maybe = embed_text(semantic_query)
        if inspect.isawaitable(maybe):
            qv = cast(list[float], await maybe)
        else:
            qv = list(cast(Sequence[float], maybe))

    filters = SearchFilters(
        assignee=assignee,
        cpc=cpc,
        date_from=date_from,
        date_to=date_to,
    )

    rows = await trend_volume(
        conn,
        group_by=group_by,
        filters=filters,
        keywords=q,
        query_vec=qv,
    )
    points: list[TrendPoint] = [TrendPoint(bucket=str(b), count=int(c)) for b, c in rows]
    return TrendResponse(points=points)


@app.get("/patent-date-range", response_model=DateRangeReponse)
async def get_patent_date_range(conn: Conn) -> DateRangeReponse:
    sql = "SELECT MIN(pub_date), MAX(pub_date) FROM patent"
    async with conn.cursor() as cur:
        await cur.execute(sql)
        row = await cur.fetchone()
    if not row:
        return DateRangeReponse(min_date=None, max_date=None)
    return DateRangeReponse(min_date=row[0], max_date=row[1])


@app.get("/patent/{pub_id}", response_model=PatentDetail)
async def get_detail(pub_id: str, conn: Conn) -> PatentDetail:
    detail = await get_patent_detail(conn, pub_id)
    if not detail:
        raise HTTPException(status_code=404, detail="not found")
    return detail
