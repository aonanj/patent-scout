# app/whitespace_api.py
from __future__ import annotations

import json
import os
from typing import Annotated, Any

import igraph as ig
import leidenalg as la
import numpy as np
import psycopg
import umap
from fastapi import APIRouter, Depends, HTTPException
from psycopg import sql as _sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field
from sklearn.neighbors import NearestNeighbors

from .db import get_conn
from .repository import SEARCH_EXPR

router = APIRouter(prefix="/whitespace", tags=["whitespace"])

# --- DB pool ---
_DB_URL = os.getenv("DATABASE_URL")
_pool: ConnectionPool | None = None
def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not _DB_URL:
            raise RuntimeError("DATABASE_URL not set")
        _pool = ConnectionPool(conninfo=_DB_URL, min_size=1, max_size=4, kwargs={"autocommit": False})
    return _pool
Conn = Annotated[psycopg.AsyncConnection, Depends(get_conn)]

_HAVE_LEIDEN = True
_HAVE_UMAP = True

# --- SQL DDL and helpers ---
DDL = [
    """
    CREATE TABLE IF NOT EXISTS knn_edge (
      src text NOT NULL,
      dst text NOT NULL,
      w   real NOT NULL,
      PRIMARY KEY (src, dst)
    );
    """,
    "ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS cluster_id integer;",
    "ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS local_density real;",
    "ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS whitespace_score real;",
    """
    CREATE MATERIALIZED VIEW IF NOT EXISTS cluster_stats AS
    SELECT
      e.cluster_id,
      count(*)::int AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY p.pub_date) AS median_pub_date,
      jsonb_agg(DISTINCT p.assignee_name) FILTER (WHERE p.assignee_name IS NOT NULL) AS assignees,
      jsonb_agg(DISTINCT p.cpc) FILTER (WHERE p.cpc IS NOT NULL) AS cpcs
    FROM patent_embeddings e
    JOIN patent p ON p.pub_id = e.pub_id
    WHERE e.cluster_id IS NOT NULL
    GROUP BY e.cluster_id;
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS cluster_stats_cluster_id_idx ON cluster_stats (cluster_id);",
]
UPSERT_EDGE = "INSERT INTO knn_edge(src,dst,w) VALUES (%s,%s,%s) ON CONFLICT(src,dst) DO UPDATE SET w=EXCLUDED.w;"
UPDATE_EMB = """
UPDATE patent_embeddings AS e
SET cluster_id = u.cluster_id,
    local_density = u.local_density,
    whitespace_score = u.whitespace_score
FROM (VALUES %s) AS u(pub_id, cluster_id, local_density, whitespace_score)
WHERE e.pub_id = u.pub_id AND e.model = %s;
"""

def ensure_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        for stmt in DDL:
            cur.execute(_sql.SQL(stmt)) # type: ignore
    conn.commit()

# --- Request and response models ---
class GraphRequest(BaseModel):
    date_from: str | None = Field(None, description="YYYY-MM-DD")
    date_to: str | None = Field(None, description="YYYY-MM-DD")
    neighbors: int = 15
    resolution: float = 0.5
    alpha: float = 0.8
    beta: float = 0.5
    limit: int | None = 2000
    focus_keywords: list[str] = []
    focus_cpc_like: list[str] = []
    layout: bool = True          # compute 2D layout for graph response
    layout_min_dist: float = 0.1 # UMAP param
    layout_neighbors: int = 25   # UMAP param

class GraphNode(BaseModel):
    id: str
    cluster_id: int
    score: float
    density: float
    x: float
    y: float

class GraphEdge(BaseModel):
    source: str
    target: str
    w: float

class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

# --- Utilities ---
def _to_int_date(s: str | None) -> int | None:
    if not s:
        return None
    y, m, d = s.split("-")
    return int(f"{y}{m}{d}")

def load_embeddings(conn: psycopg.Connection, model: str, req: GraphRequest) -> tuple[np.ndarray, list[str]]:
    where = ["e.model = %s"]
    params: list[Any] = [model]
    df = _to_int_date(req.date_from)
    dt = _to_int_date(req.date_to)
    if df is not None:
        where.append("p.pub_date >= %s")
        params.append(df)
    if dt is not None:
        where.append("p.pub_date < %s")
        params.append(dt)
    sql = f"""
    SELECT e.pub_id, e.embedding
    FROM patent_embeddings e
    JOIN patent p USING (pub_id)
    WHERE {' AND '.join(where)}
    ORDER BY p.pub_date DESC, e.pub_id
    """
    if req.limit:
        sql += " LIMIT %s"
        params.append(req.limit)
    pub_ids: list[str] = []
    vecs: list[np.ndarray] = []
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(_sql.SQL(sql), params) # type: ignore
        for r in cur:
            pub_ids.append(r["pub_id"])
            vecs.append(np.asarray(json.loads(r["embedding"]), dtype=np.float32))
    if not vecs:
        raise HTTPException(400, "No embeddings match the filters.")
    X = np.vstack(vecs)
    # cosine normalization
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    X = X / norms
    return X, pub_ids

def load_focus_mask(conn: psycopg.Connection, pub_ids: list[str], req: GraphRequest) -> np.ndarray:
    if not req.focus_keywords and not req.focus_cpc_like:
        return np.zeros(len(pub_ids), dtype=bool)
    q = "SELECT p.pub_id FROM patent p WHERE p.pub_id = ANY(%s)"
    params: list[Any] = [pub_ids]
    conds = []
    if req.focus_keywords:
        # OR together each keyword using full-text search on title/abstract/claims
        kw_conds = [f"(({SEARCH_EXPR}) @@ plainto_tsquery('english', %s))" for _ in req.focus_keywords]
        if kw_conds:
            conds.append("(" + " OR ".join(kw_conds) + ")")
            params.extend(req.focus_keywords)
    if req.focus_cpc_like:
        conds.append("""
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(p.cpc) c(obj)
            WHERE (
              coalesce(obj->>'section','')||coalesce(obj->>'class','')||coalesce(obj->>'subclass','')||
              coalesce(obj->>'main_group','')||'/'||coalesce(obj->>'subgroup','')
            ) LIKE ANY(%s)
          )
        """)
        params.append(req.focus_cpc_like)
    if conds:
        q += " AND " + " AND ".join(conds)
    focus = set()
    with conn.cursor() as cur:
        cur.execute(_sql.SQL(q), params)
        for (pid,) in cur.fetchall():
            focus.add(pid)
    return np.array([pid in focus for pid in pub_ids], dtype=bool)

def build_knn(X: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    nbrs = NearestNeighbors(n_neighbors=k, metric="cosine", n_jobs=-1).fit(X)
    dist, idx = nbrs.kneighbors(X)
    return dist.astype(np.float32), idx.astype(np.int32)

def local_density(dist: np.ndarray) -> np.ndarray:
    return (1.0 - dist).mean(axis=1).astype(np.float32)

def cluster_labels(dist: np.ndarray, idx: np.ndarray, resolution: float) -> np.ndarray:
    n = dist.shape[0]
    if _HAVE_LEIDEN:
        g = ig.Graph(n=n, directed=False)
        edges, weights = [], []
        for i in range(n):
            for jpos, j in enumerate(idx[i]):
                if i == j: 
                    continue
                if i < j:
                    edges.append((i, j))
                    weights.append(float(1.0 - dist[i, jpos]))
        g.add_edges(edges)
        g.es["weight"] = weights
        part = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight", resolution_parameter=resolution)
        return np.array(part.membership, dtype=np.int32)
    # fallback: thresholded components
    sim_thresh = 0.75
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    def union(a,b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
    for i in range(n):
        for jpos, j in enumerate(idx[i]):
            if i == j: 
                continue
            if 1.0 - float(dist[i, jpos]) >= sim_thresh:
                union(i, j)
    roots = {find(i) for i in range(n)}
    m = {r:k for k,r in enumerate(sorted(roots))}
    return np.array([m[find(i)] for i in range(n)], dtype=np.int32)

def neighbor_momentum(conn: psycopg.Connection, pub_ids: list[str], labels: np.ndarray) -> np.ndarray:
    """psycopg3 COPY-based aggregation; returns per-cluster momentum ∈ [0,1]."""
    # 1) Temp table with (pub_id, cluster_id)
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TEMP TABLE tmp_labels(
              pub_id text PRIMARY KEY,
              cluster_id int
            ) ON COMMIT DROP
        """)
        with cur.copy("COPY tmp_labels (pub_id, cluster_id) FROM STDIN") as cp:
            for pid, cid_val in zip(pub_ids, labels, strict=False):
                # psycopg3's write_row with default format handles None correctly
                cid = int(cid_val) if cid_val is not None and not np.isnan(cid_val) else None
                cp.write_row((pid, cid))

        # 2) Compute cutoff and momentum per cluster in SQL
        cur.execute("""
            WITH d AS (
              SELECT tl.cluster_id, p.pub_date
              FROM tmp_labels tl
              JOIN patent p USING (pub_id)
            ),
            cutoff AS (
              SELECT (MAX(pub_date) - 90) AS c FROM d
            ),
            m AS (
              SELECT
                cluster_id,
                GREATEST(0.0, SUM(CASE WHEN pub_date >= c THEN 1.0 ELSE -0.25 END)) AS m
              FROM d, cutoff
              GROUP BY cluster_id
            )
            SELECT cluster_id, m FROM m
            ORDER BY cluster_id
        """)
        rows = cur.fetchall()

    if not rows:
        return np.zeros(int(labels.max()) + 1, dtype=np.float32)

    # 3) Normalize to [0,1] and pack into dense array by cluster_id
    max_cid = max(r[0] for r in rows)
    arr = np.zeros(max_cid + 1, dtype=np.float32)
    for cid, m in rows:
        arr[int(cid)] = float(m)
    mmax = float(arr.max())
    if mmax > 0:
        arr /= mmax
    return arr


def whitespace_scores(X: np.ndarray, labels: np.ndarray, dens: np.ndarray, focus_mask: np.ndarray, alpha: float, beta: float, momentum: np.ndarray) -> np.ndarray:
    if focus_mask.any():
        F = X[focus_mask].mean(axis=0)
    else:
        F = X.mean(axis=0)
        alpha *= 0.5
    d = np.linalg.norm(X - F[None, :], axis=1)
    proximity = np.exp(-alpha * d).astype(np.float32)
    dmin, dmax = float(dens.min()), float(dens.max())
    densn = (dens - dmin) / (dmax - dmin + 1e-9)
    sparse = (1.0 - densn).astype(np.float32)
    mom = momentum.take(labels.astype(np.int32), mode="clip")
    score = proximity * sparse * (1.0 + beta * mom)
    score[focus_mask] = 0.0
    return score.astype(np.float32)

def persist(
    conn: psycopg.Connection,
    pub_ids: list[str],
    model: str,
    dist: np.ndarray,
    idx: np.ndarray,
    labels: np.ndarray,
    dens: np.ndarray,
    scores: np.ndarray,
) -> None:
    """psycopg3 COPY-based upsert for edges and label/score updates."""
    k = idx.shape[1]

    with conn.cursor() as cur:
        # 1) Temp edges
        cur.execute("""
            CREATE TEMP TABLE tmp_edges(
              src text,
              dst text,
              w   real
            ) ON COMMIT DROP
        """)
        with cur.copy("COPY tmp_edges (src, dst, w) FROM STDIN") as cp:
            for i, src in enumerate(pub_ids):
                for jpos in range(k):
                    j = int(idx[i, jpos])
                    if i == j:
                        continue
                    cp.write_row((src, pub_ids[j], float(1.0 - dist[i, jpos])))

        # Upsert edges
        cur.execute("""
            INSERT INTO knn_edge(src, dst, w)
            SELECT src, dst, w FROM tmp_edges
            ON CONFLICT (src, dst) DO UPDATE SET w = EXCLUDED.w
        """)

        # 2) Temp updates for embeddings
        cur.execute("""
            CREATE TEMP TABLE tmp_updates(
              pub_id          text PRIMARY KEY,
              cluster_id      int,
              local_density   real,
              whitespace_score real
            ) ON COMMIT DROP
        """)
        with cur.copy("COPY tmp_updates (pub_id, cluster_id, local_density, whitespace_score) FROM STDIN") as cp:
            for pid, cid, d, s in zip(
                pub_ids,
                labels.astype(int).tolist(),
                dens.astype(float).tolist(),
                scores.astype(float).tolist(),
                strict=False,
            ):
                cp.write_row((pid, int(cid), float(d), float(s)))

        # Apply updates to target table for the selected model
        cur.execute("""
            UPDATE patent_embeddings AS e
            SET cluster_id = t.cluster_id,
                local_density = t.local_density,
                whitespace_score = t.whitespace_score
            FROM tmp_updates t
            WHERE e.pub_id = t.pub_id AND e.model = %s
        """, (model,))

        # 3) Refresh stats
        cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY cluster_stats;")

    conn.commit()


# --- Endpoints ---

@router.post("/graph", response_model=GraphResponse)
def get_whitespace_graph(req: GraphRequest, pool: Annotated[ConnectionPool, Depends(get_pool)]) -> GraphResponse:
    with pool.connection() as conn:
        ensure_schema(conn)
        model = "text-embedding-3-small|ta"
        X, pub_ids = load_embeddings(conn, model, req)
        focus_mask = load_focus_mask(conn, pub_ids, req)

        dist, idx = build_knn(X, req.neighbors)
        labels = cluster_labels(dist, idx, req.resolution)
        dens = local_density(dist)
        mom = neighbor_momentum(conn, pub_ids, labels)
        scores = whitespace_scores(X, labels, dens, focus_mask, req.alpha, req.beta, mom)

        # persist to DB
        persist(conn, pub_ids, model, dist, idx, labels, dens, scores)

        # layout
        if req.layout and _HAVE_UMAP:
            reducer = umap.UMAP(n_neighbors=req.layout_neighbors, min_dist=req.layout_min_dist, metric="cosine", random_state=42)
            embedding = reducer.fit_transform(X)
            XY = np.asarray(embedding).astype(np.float32)
        else:
            # PCA 2D fallback
            mu = X.mean(axis=0, keepdims=True)
            Xc = X - mu
            U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
            XY = (Xc @ Vt[:2].T).astype(np.float32)

        # build graph response (cap edges per node for UI)
        nodes = []
        for i, pid in enumerate(pub_ids):
            nodes.append(
                GraphNode(
                    id=pid,
                    cluster_id=int(labels[i]),
                    score=float(scores[i]),
                    density=float(dens[i]),
                    x=float(XY[i, 0]),
                    y=float(XY[i, 1]),
                )
            )

        edges = []
        for i, src in enumerate(pub_ids):
            for j_idx, j in enumerate(idx[i, 1:11]): # at most 10 edges
                edges.append(
                    GraphEdge(
                        source=src,
                        target=pub_ids[j],
                        w=float(1.0 - dist[i, j_idx + 1]),
                    )
                )
        return GraphResponse(nodes=nodes, edges=edges)