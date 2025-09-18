# app/repository.py
from __future__ import annotations

import os
from collections.abc import Iterable
from typing import Final

import psycopg
from psycopg.rows import dict_row
from psycopg.sql import SQL, Composed

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
        where.append("assignee_name ILIKE %s")
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
        where.append("pub_date >= %s")
        args.append(_dtint(f.date_from))

    if f.date_to:
        where.append("pub_date < %s")
        args.append(_dtint(f.date_to))


    return " AND ".join(where)

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
    where_sql = _filters_sql(filters, args) 
    _sql = SQL("")

    base_cte = f"""
    base AS (
      SELECT p.pub_id,
             p.title,
             p.abstract,
             p.assignee_name,
             p.pub_date,
             p.kind_code,
             p.cpc
      FROM patent p
      WHERE {where_sql}
    )
    """

    with_parts: list[str] = [base_cte]

    if keywords:
        kw_inner = """
          SELECT pub_id,
                 title, abstract, assignee_name, pub_date, kind_code,
                 ts_rank_cd(
                   to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')),
                   plainto_tsquery('english', %s)
                 ) AS kw_score
          FROM base
          WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,''))
                @@ plainto_tsquery('english', %s)
        """
        with_parts.append(
            f"kw AS (SELECT *, ROW_NUMBER() OVER (ORDER BY kw_score DESC) AS kw_rank FROM ({kw_inner}) s)"
        )
        args.extend([keywords, keywords])

    if query_vec is not None:
        # First, find candidate pub_ids from vector search
        vec_candidates_cte = f"""
        vec_candidates AS (
            SELECT pub_id, (embedding <-> %s{_VEC_CAST}) AS vec_dist
            FROM patent_embeddings
            WHERE model LIKE '%%|ta' AND (embedding <-> %s{_VEC_CAST}) < 0.5
        )
        """
        with_parts.append(vec_candidates_cte)
        args.extend([list(query_vec), list(query_vec)])

        # Then, join these candidates with the already-filtered base patents
        vec_inner = """
          SELECT b.pub_id, b.title, b.abstract, b.assignee_name, b.pub_date, b.kind_code, vc.vec_dist
          FROM base b
          JOIN vec_candidates vc ON b.pub_id = vc.pub_id
        """
        with_parts.append(
            f"vec AS (SELECT *, ROW_NUMBER() OVER (ORDER BY vec_dist ASC) AS vec_rank FROM ({vec_inner}) s)"
        )


    # No signals -> recency
    if len(with_parts) == 1:
        sql = f"""
        WITH {with_parts[0]}
        , page AS (
          SELECT pub_id,
                 title, abstract, assignee_name, pub_date, kind_code
          FROM base
          ORDER BY pub_date DESC
          LIMIT %s OFFSET %s
        )
        SELECT (SELECT COUNT(*) FROM base) AS total,
               coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) AS items
        FROM page;
        """
        args.extend([limit, offset])
    else:
        if keywords and query_vec is not None:
            tail = """
            fused AS (
              SELECT coalesce(k.pub_id, v.pub_id) AS pub_id,
                     coalesce(k.title, v.title) AS title,
                     coalesce(k.abstract, v.abstract) AS abstract,
                     coalesce(k.assignee_name, v.assignee_name) AS assignee_name,
                     coalesce(k.pub_date, v.pub_date) AS pub_date,
                     coalesce(k.kind_code, v.kind_code) AS kind_code,
                     (coalesce(1.0 / k.kw_rank, 0) + coalesce(1.0 / v.vec_rank, 0)) AS score
              FROM kw k FULL OUTER JOIN vec v ON k.pub_id = v.pub_id
            ),
            page AS (
              SELECT * FROM fused ORDER BY score DESC
              LIMIT %s OFFSET %s
            )
            SELECT (SELECT COUNT(*) FROM fused) AS total,
                   coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) AS items
            FROM page;
            """
        elif keywords:
            tail = """
            , page AS (
              SELECT pub_id, title, abstract, assignee_name, pub_date, kind_code, kw_score AS score
              FROM kw
              ORDER BY kw_rank ASC
              LIMIT %s OFFSET %s
            )
            SELECT (SELECT COUNT(*) FROM kw) AS total,
                   coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) AS items
            FROM page;
            """
        else: # Vector only
            tail = """
            , page AS (
              SELECT pub_id, title, abstract, assignee_name, pub_date, kind_code,
                     (1.0 / NULLIF(vec_rank,0)) AS score
              FROM vec
              ORDER BY vec_rank ASC
              LIMIT %s OFFSET %s
            )
            SELECT (SELECT COUNT(*) FROM vec) AS total,
                   coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) AS items
            FROM page;
            """
        sql = ",\n".join(s.strip() for s in with_parts)

        _sql = SQL("WITH\n")
        _sql += Composed(sql)
        _sql += SQL("\n")
        _sql += SQL(tail)

        args.extend([limit, offset])

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(_sql, args)
        row = await cur.fetchone()


    if row is None:
        return 0, []
    total = row["total"] or 0
    items = [PatentHit(**obj) for obj in (row["items"] or [])]
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
    
    # Base query with filters
    base_filters_sql = _filters_sql(filters, args)
    
    # Vector search CTE
    with_parts = []
    if query_vec is not None:
        vec_candidates_cte = f"""
        vec_candidates AS (
            SELECT pub_id
            FROM patent_embeddings
            WHERE model LIKE '%%|ta' AND (embedding <-> %s{_VEC_CAST}) < 0.5
        )
        """
        with_parts.append(vec_candidates_cte)
        args.insert(0, list(query_vec)) # Vector is the first param
    
    # Main data selection CTE
    base_patent_cte = """
    base_patents AS (
        SELECT p.pub_id, p.pub_date, p.assignee_name, p.cpc, p.title, p.abstract
        FROM patent p
    """
    
    # Add JOIN for vector candidates if they exist
    if query_vec is not None:
        base_patent_cte += " JOIN vec_candidates vc ON p.pub_id = vc.pub_id"

    # Add WHERE clauses
    where_clauses = [base_filters_sql]
    if keywords:
        where_clauses.append("to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.abstract,'')) @@ plainto_tsquery('english', %s)")
        args.append(keywords)
    
    base_patent_cte += "\nWHERE " + " AND ".join(where_clauses)
    base_patent_cte += "\n)"
    with_parts.append(base_patent_cte)

    # Grouping and final selection
    if group_by == "month":
        bucket_sql = "to_char(to_date(pub_date::text,'YYYYMMDD'), 'YYYY-MM')"
        final_select = f"""
        SELECT {bucket_sql} AS bucket, COUNT(DISTINCT pub_id) AS count
        FROM base_patents
        WHERE {bucket_sql} IS NOT NULL
        GROUP BY bucket
        ORDER BY count DESC
        """
    elif group_by == "cpc":
        bucket_sql = "( (c->>'section') || COALESCE(c->>'class', '') )"
        final_select = f"""
        SELECT {bucket_sql} AS bucket, COUNT(DISTINCT pub_id) AS count
        FROM base_patents, LATERAL jsonb_array_elements(COALESCE(cpc, '[]'::jsonb)) c
        WHERE {bucket_sql} IS NOT NULL
        GROUP BY bucket
        ORDER BY count DESC
        """
    elif group_by == "assignee":
        bucket_sql = "assignee_name"
        final_select = f"""
        SELECT {bucket_sql} AS bucket, COUNT(DISTINCT pub_id) AS count
        FROM base_patents
        WHERE {bucket_sql} IS NOT NULL
        GROUP BY bucket
        ORDER BY count DESC
        """
    else:
        raise ValueError("invalid group_by")

    sql = f"WITH {', '.join(with_parts)}\n{final_select}"

    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, args)
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
        await cur.execute(sql, [pub_id])  # type: ignore[arg-type]
        row = await cur.fetchone()

    return PatentDetail(**row) if row else None
