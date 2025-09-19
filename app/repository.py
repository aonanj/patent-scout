# app/repository.py
from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from typing import Final, Optional, Dict, Any, List, Tuple

import psycopg
from psycopg import sql as _sql
from psycopg.rows import dict_row

from .schemas import PatentDetail, PatentHit, SearchFilters

_VEC_CAST: Final[str] = (
    "::halfvec" if os.environ.get("VECTOR_TYPE", "vector").lower().startswith("half") else "::vector"
)

def _dtint(s: int | str | None) -> int | None:
    if s is None:
        return None
    if isinstance(s, int):
        return s
    # accepts YYYY-MM-DD or YYYYMMDD
    t = s.replace("-", "")
    return int(t) if t.isdigit() and len(t) == 8 else None

def _filters_sql(f: SearchFilters, args: list[object]) -> str:
    """Build WHERE clause and append positional args."""
    where: list[str] = ["1=1"]

    if f.assignee:
        where.append("p.assignee_name ILIKE %s")
        args.append(f"%{f.assignee}%")

    if f.cpc:
        prefix = f.cpc.upper().replace(" ", "")
        where.append(
            "EXISTS ("
            "   SELECT 1 FROM jsonb_array_elements(COALESCE(p.cpc, '[]'::jsonb)) c"
            "   WHERE ( (c->>'section')"
            "          || (c->>'class')"
            "          || (c->>'subclass')"
            "          || COALESCE(c->>'group', '')"
            "          || COALESCE('/' || (c->>'subgroup'), '') ) LIKE %s"
            ")"
        )
        args.append(f"{prefix}%")

    if f.date_from:
        where.append("p.pub_date >= %s")
        args.append(_dtint(f.date_from))

    if f.date_to:
        where.append("p.pub_date < %s")
        args.append(_dtint(f.date_to))


    return " AND ".join(where)

def _adaptive_filters(rows: List[Dict[str, Any]], *,
                      dist_cap: Optional[float] = None,
                      jump: float = 0.05,
                      limit: int = 50) -> List[Dict[str, Any]]:
    if not rows:
        return rows
    
    keep = []
    last = rows[0]["dist"]
    for r in rows:
        d = r["dist"]
        if dist_cap is not None and d > dist_cap:
            break
        if keep and (d - last) > jump:
            break
        keep.append(r)
        last = d
        if len(keep) >= limit:
            break
    return keep

async def search_hybrid(
    conn: psycopg.AsyncConnection,
    *,
    keywords: str | None,
    query_vec: Iterable[float] | None,
    limit: int,
    offset: int,
    filters: SearchFilters,
) -> tuple[int, list[PatentHit]]:
    """Keyword and/or vector search with simple reciprocal-rank fusion."""
    args: list[object] = []
    
    # Base query parts
    select_core = """
        SELECT p.pub_id, p.title, p.abstract, p.assignee_name, p.pub_date, p.kind_code, p.cpc
    """
    
    from_clause = "FROM patent p"
    joins = []
    where = [_filters_sql(filters, args)]

    if query_vec is not None:
        joins.append(
            """
            JOIN patent_embeddings e ON p.pub_id = e.pub_id
            """
        )
        where.append(f"(e.embedding <=> %s{_VEC_CAST}) < 0.5")
        where.append("e.model LIKE '%%|ta'")
        args.insert(0, list(query_vec))


    if keywords:
        where.append("to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.abstract,'')) @@ plainto_tsquery('english', %s)")
        args.append(keywords)
    
    # Build the full query
    base_query = f"{from_clause} {' '.join(joins)} WHERE {' AND '.join(where)}"
    
    count_query = f"SELECT COUNT(DISTINCT p.pub_id) {base_query}"
    
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(_sql.SQL(count_query), args) # type: ignore
        total_row = await cur.fetchone()
        total = total_row['count'] if total_row else 0

    # Now get the paginated results
    if query_vec is not None:
        # Re-add vector for ordering
        args.append(list(query_vec))
        order_by = f"ORDER BY (e.embedding <=> %s{_VEC_CAST}) ASC"
    elif keywords:
         # we need to add the keyword to the args again for ordering
         args.append(keywords)
         order_by = "ORDER BY ts_rank_cd(to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.abstract,'')), plainto_tsquery('english', %s)) DESC"
    else:
        order_by = "ORDER BY p.pub_date DESC"

    paged_query = f"{select_core} {base_query} {order_by} LIMIT %s OFFSET %s"
    args.extend([limit, offset])

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(_sql.SQL(paged_query), args) # type: ignore
        rows = await cur.fetchall()

    items = [PatentHit(**row) for row in rows]
    return total, items


async def trend_volume(
    conn: psycopg.AsyncConnection,
    *,
    group_by: str,
    filters: SearchFilters,
    keywords: str | None = None,
    query_vec: Iterable[float] | None = None,
) -> list[tuple[str, int]]:
    """Aggregate counts by month, CPC, or assignee, with optional keyword and vector filtering."""
    args: list[object] = []
    
    from_clause = "FROM patent p"
    joins = []
    where_clauses = [_filters_sql(filters, args)]

    if query_vec:
        joins.append(
            """
            JOIN patent_embeddings e ON p.pub_id = e.pub_id
            """
        )
        where_clauses.append(f"(e.embedding <=> %s{_VEC_CAST}) < 0.5")
        where_clauses.append("e.model LIKE '%%|ta'")
        args.insert(0, list(query_vec))

    if keywords:
        where_clauses.append("to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.abstract,'')) @@ plainto_tsquery('english', %s)")
        args.append(keywords)
    
    # Grouping logic
    if group_by == "month":
        bucket_sql = "to_char(to_date(p.pub_date::text,'YYYYMMDD'), 'YYYY-MM')"
    elif group_by == "cpc":
        bucket_sql = "( (c->>'section') || COALESCE(c->>'class', '') )"
        from_clause += ", LATERAL jsonb_array_elements(COALESCE(p.cpc, '[]'::jsonb)) c"
    elif group_by == "assignee":
        bucket_sql = "p.assignee_name"
    else:
        raise ValueError("invalid group_by")

    sql = f"""
        SELECT {bucket_sql} AS bucket, COUNT(DISTINCT p.pub_id) AS count
        {from_clause}
        {' '.join(joins)}
        WHERE {' AND '.join(where_clauses)} AND {bucket_sql} IS NOT NULL
        GROUP BY bucket
        ORDER BY count DESC
    """

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(_sql.SQL(sql), args) # type: ignore
        rows = await cur.fetchall()

    return [(r["bucket"], r["count"]) for r in rows]


async def get_patent_detail(
    conn: psycopg.AsyncConnection, pub_id: str
) -> PatentDetail | None:
    """Fetch one patent record by publication number."""
    sql = """
    SELECT pub_id,
           application_number,
           kind_code,
           pub_date,
           filing_date,
           title,
           abstract,
           claims_text,
           assignee_name,
           inventor_name,
           cpc
    FROM patent
    WHERE pub_id = %s
    LIMIT 1;
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, [pub_id])
        row = await cur.fetchone()

    return PatentDetail(**row) if row else None