from __future__ import annotations

import importlib.util
import inspect
import os

# Standard library imports
from collections.abc import Sequence
from io import BytesIO
from typing import Annotated, Any, cast

import psycopg

# Third-party imports
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from psycopg.rows import dict_row
from psycopg.types.json import Json
from pydantic import BaseModel

# Local application imports
from .auth import get_current_user
from .db import get_conn, init_pool
from .embed import embed as embed_text
from .repository import export_rows, get_patent_detail, search_hybrid, trend_volume
from .schemas import (
    PatentDetail,
    SearchFilters,
    SearchRequest,
    SearchResponse,
    TrendPoint,
    TrendResponse,
)

# Optional PDF support
_has_reportlab = (
    importlib.util.find_spec("reportlab") is not None
    and importlib.util.find_spec("reportlab.pdfgen") is not None
    and importlib.util.find_spec("reportlab.lib.pagesizes") is not None
)
if _has_reportlab:
    from reportlab.lib.pagesizes import letter as _LETTER  # type: ignore
    from reportlab.pdfgen import canvas as _CANVAS  # type: ignore
    HAVE_REPORTLAB = True
else:  # pragma: no cover - optional dependency missing
    _LETTER = None  # type: ignore[assignment]
    _CANVAS = None  # type: ignore[assignment]
    HAVE_REPORTLAB = False

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


class SavedQueryUpdate(BaseModel):
    is_active: bool | None = None
    # In the future, allow updating schedule_cron or other fields if needed
    # schedule_cron: str | None = None


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


@app.patch("/saved-queries/{id}")
async def update_saved_query(id: str, req: SavedQueryUpdate, conn: Conn, user: User):
    """Update a saved query owned by the current user.

    Currently supports toggling is_active.
    """
    owner_id = user.get("sub")
    if owner_id is None:
        raise HTTPException(status_code=400, detail="user missing sub claim")

    if req.is_active is None:
        raise HTTPException(status_code=400, detail="no updatable fields provided")

    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE saved_query SET is_active = %s, updated_at = now() WHERE id = %s AND owner_id = %s RETURNING id",
            [req.is_active, id, owner_id],
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="saved query not found")
    return {"id": row[0], "is_active": req.is_active}


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


def _int_date(v: int | None) -> str:
    if not v:
        return ""
    s = str(v)
    if len(s) == 8:
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s


@app.get("/export")
async def export(
    conn: Conn,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    q: str | None = Query(None),
    assignee: str | None = Query(None),
    cpc: str | None = Query(None),
    date_from: int | None = Query(None),
    date_to: int | None = Query(None),
    semantic_query: str | None = Query(None),
    limit: int = Query(1000, ge=1, le=1000),
):
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

    rows = await export_rows(
        conn,
        keywords=q,
        query_vec=qv,
        filters=filters,
        limit=limit,
    )

    filename = "patent_scout_export"
    if format == "csv":
        def gen():
            header = ["pub_id", "title", "abstract", "assignee_name", "pub_date", "cpc", "priority_date"]
            yield (",").join(header) + "\n"
            for r in rows:
                vals = [
                    r.get("pub_id") or "",
                    (r.get("title") or "").replace("\n", " ").replace("\r", " "),
                    (r.get("abstract") or "").replace("\n", " ").replace("\r", " "),
                    r.get("assignee_name") or "",
                    _int_date(r.get("pub_date")),
                    r.get("cpc") or "",
                    _int_date(r.get("priority_date")),
                ]
                # Basic CSV quoting
                out = []
                for v in vals:
                    s = str(v)
                    if any(ch in s for ch in [',','\n','\r','"']):
                        s = '"' + s.replace('"','""') + '"'
                    out.append(s)
                yield ",".join(out) + "\n"
        headers = {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": f"attachment; filename={filename}.csv",
        }
        return StreamingResponse(gen(), headers=headers, media_type="text/csv")

    # PDF
    if not HAVE_REPORTLAB:
        raise HTTPException(status_code=500, detail="PDF generation not available on server")

    buffer = BytesIO()
    c = _CANVAS.Canvas(buffer, pagesize=_LETTER)  # type: ignore[union-attr]
    width, height = _LETTER  # type: ignore[assignment]

    margin = 40
    y = height - margin
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "Patent Scout Export (top results)")
    y -= 18
    c.setFont("Helvetica", 9)

    def _ensure_space():
        nonlocal y
        if y < 60:
            c.showPage()
            y = height - margin

    def draw_label_value(label: str, value: str | None, label_font: str = "Helvetica-Bold", label_size: int = 9, value_font: str = "Helvetica", value_size: int = 9):
        """Draw a label in bold on its own line, followed by the value on subsequent wrapped lines.
        This guarantees each field starts on a new line for readability."""
        nonlocal y
        if not value:
            return
        _ensure_space()
        label_text = f"{label}:"
        # draw label on its own line
        c.setFont(label_font, label_size)
        c.drawString(margin, y, label_text)
        y -= 12
        _ensure_space()
        # now draw wrapped value starting at margin
        c.setFont(value_font, value_size)
        max_value_width = width - margin * 2
        words = str(value).split()
        line = ""
        for w in words:
            test = (line + " " + w).strip()
            test_w = c.stringWidth(test, value_font, value_size)
            if test_w <= max_value_width:
                line = test
            else:
                c.drawString(margin, y, line)
                y -= 12
                _ensure_space()
                line = w
        if line:
            c.drawString(margin, y, line)
            y -= 12

    def draw_inline_meta(pairs: list[tuple[str, str]]):
        """Draw meta pairs with each pair on its own line using the label/value layout for consistency."""
        nonlocal y
        if not pairs:
            return
        for lab, val in pairs:
            draw_label_value(lab, val)

    for r in rows:
        # Pub id (bold label)
        draw_label_value("Pub", r.get("pub_id"), label_size=10)

        # Title and Assignee
        if r.get("title"):
            draw_label_value("Title", r.get("title"))
        if r.get("assignee_name"):
            draw_label_value("Assignee", r.get("assignee_name"))

        # Inline meta (Pub Date | Priority)
        date_s = _int_date(r.get("pub_date"))
        prio_s = _int_date(r.get("priority_date"))
        meta_pairs: list[tuple[str, str]] = []
        if date_s:
            meta_pairs.append(("Pub Date", date_s))
        if prio_s:
            meta_pairs.append(("Priority", prio_s))
        if meta_pairs:
            draw_inline_meta(meta_pairs)

        # CPC
        if r.get("cpc"):
            draw_label_value("CPC", r.get("cpc"))

        # Abstract (use the label/value wrapper to handle wrapping)
        if r.get("abstract"):
            abstract = str(r.get("abstract")).replace("\n", " ")
            draw_label_value("Abstract", abstract)

        # horizontal separator between records
        _ensure_space()
        # draw a thin line and advance
        c.setLineWidth(0.5)
        c.line(margin, y, width - margin, y)
        y -= 12

    c.showPage()
    c.save()
    buffer.seek(0)
    headers = {
        "Content-Type": "application/pdf",
        "Content-Disposition": f"attachment; filename={filename}.pdf",
    }
    return StreamingResponse(buffer, headers=headers, media_type="application/pdf")
