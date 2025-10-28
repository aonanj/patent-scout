# app/whitespace_api.py
from __future__ import annotations

import json
import os
import re
import uuid
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from typing import Annotated, Any, Literal

import igraph as ig
import leidenalg as la
import numpy as np
import psycopg
import umap
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg import sql as _sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field
from sklearn.neighbors import NearestNeighbors

from infrastructure.logger import get_logger

from .auth import get_current_user
from .repository import CANONICAL_ASSIGNEE_LATERAL, SEARCH_EXPR
from .subscription_middleware import SubscriptionRequiredError
from .whitespace_signals import (
    SignalComputation,
    SignalKind,
    signal_bridge,
    signal_crowd_out,
    signal_emerging_gap,
    signal_focus_shift,
)

router = APIRouter(
    prefix="/whitespace",
    tags=["whitespace"],
    dependencies=[Depends(get_current_user)],
)

User = Annotated[dict, Depends(get_current_user)]

logger = get_logger()

MAX_GRAPH_LIMIT = 2000
MAX_GRAPH_NEIGHBORS = 50
MAX_GRAPH_LAYOUT_NEIGHBORS = 50

SearchMode = Literal["keywords", "assignee"]
GroupKind = Literal["assignee", "cluster"]

ASSIGNEE_FUZZY_THRESHOLD = 0.80
ASSIGNEE_MATCH_LIMIT = 12
_ASSIGNEE_RAW_SUFFIXES = [
    "INC",
    "LLC",
    "CORP",
    "LTD",
    "CORPORATION",
    "INCORPORATED",
    "INCORP",
    "COMPANY",
    "LIMITED",
    "GMBH",
    "ASS",
    "PTY",
    "MFF",
    "SYS",
    "MAN",
    "L Y",
    "L P",
    "LY",
    "LP",
    "OY",
    "NV",
    "SAS",
    "CO",
    "BV",
    "AG",
    "A G",
    "A B",
    "O Y",
    "N V",
    "S E",
    "N A",
    "MANF",
    "INST",
    "B V",
    "INT",
    "IND",
    "KK",
    "SE",
    "AB",
    "INTL",
    "INDST",
    "NA",
]
_ASSIGNEE_SUFFIXES: list[str] = sorted(
    list(dict.fromkeys(s.strip().upper() for s in _ASSIGNEE_RAW_SUFFIXES if s.strip())),
    key=len,
    reverse=True,
)

CLUSTER_TERM_SAMPLE_SIZE = 20
CLUSTER_LABEL_MIN_TERMS = 3
CLUSTER_LABEL_MAX_TERMS = 8
CLUSTER_LABEL_STOPWORDS: set[str] = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "that",
    "this",
    "those",
    "these",
    "their",
    "there",
    "where",
    "when",
    "which",
    "about",
    "using",
    "based",
    "system",
    "systems",
    "method",
    "methods",
    "device",
    "devices",
    "apparatus",
    "apparatuses",
    "process",
    "processes",
    "module",
    "modules",
    "unit",
    "units",
    "network",
    "networks",
    "data",
    "information",
    "control",
    "controlled",
    "controls",
    "application",
    "applications",
    "computer",
    "computers",
    "program",
    "programs",
    "sensor",
    "sensors",
    "analysis",
    "analyzing",
    "electric",
    "electrical",
    "component",
    "components",
    "circuit",
    "circuitry",
    "user",
    "users",
    "plurality",
}

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
_HAVE_LEIDEN = True
_HAVE_UMAP = True


@dataclass(frozen=True, slots=True)
class EmbeddingMeta:
    """Metadata for a single embedding row used to build the graph."""

    pub_id: str
    is_focus: bool
    pub_date: date | None
    assignee: str | None
    title: str | None
    abstract: str | None


@dataclass(slots=True)
class NodeDatum:
    """Derived metrics per node to power signal aggregation."""

    index: int
    pub_id: str
    assignee: str
    pub_date: date | None
    cluster_id: int
    score: float
    density: float
    proximity: float
    distance: float
    momentum: float
    is_focus: bool
    title: str | None
    abstract: str | None


def _remove_punct_and_collapse(value: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z]+", " ", value)
    return " ".join(cleaned.split()).upper()


def _canonicalize_assignee_for_lookup(name: str) -> str:
    if not name:
        return ""
    tokens = _remove_punct_and_collapse(name).split()
    if not tokens:
        return ""
    changed = True
    while changed and tokens:
        changed = False
        tail = " ".join(tokens[-2:]) if len(tokens) >= 2 else tokens[-1]
        for suffix in _ASSIGNEE_SUFFIXES:
            if " " in suffix:
                parts = suffix.split()
                n = len(parts)
                if n <= len(tokens) and " ".join(tokens[-n:]) == suffix:
                    tokens = tokens[:-n]
                    changed = True
                    break
            else:
                if tokens and tokens[-1] == suffix:
                    tokens = tokens[:-1]
                    changed = True
                    break
    return " ".join(tokens).strip()


def _assignee_search_patterns(raw: str, canonical: str) -> list[str]:
    patterns: list[str] = []
    trimmed = raw.strip()
    if trimmed:
        patterns.append(f"%{trimmed}%")
    for token in canonical.split():
        if len(token) >= 3:
            patterns.append(f"%{token}%")
    if canonical and canonical not in {p.strip("%") for p in patterns}:
        patterns.append(f"%{canonical}%")
    seen: set[str] = set()
    ordered: list[str] = []
    for pattern in patterns:
        if pattern not in seen:
            ordered.append(pattern)
            seen.add(pattern)
    return ordered[:24]


def _tokenize_cluster_terms(text: str | None) -> Iterable[str]:
    if not text:
        return []
    for token in re.findall(r"[A-Za-z0-9]+", text.lower()):
        if len(token) < 3:
            continue
        if token in CLUSTER_LABEL_STOPWORDS:
            continue
        yield token


def _compute_cluster_term_map(node_data: Sequence[NodeDatum]) -> dict[int, list[str]]:
    clusters: dict[int, list[NodeDatum]] = defaultdict(list)
    for node in node_data:
        clusters[node.cluster_id].append(node)
    cluster_terms: dict[int, list[str]] = {}
    for cluster_id, nodes in clusters.items():
        sorted_nodes = sorted(
            nodes,
            key=lambda n: (-(n.score if n.score is not None else 0.0), n.pub_id),
        )[:CLUSTER_TERM_SAMPLE_SIZE]
        counter: Counter[str] = Counter()
        for node in sorted_nodes:
            for token in _tokenize_cluster_terms(node.title):
                counter[token] += 1
            for token in _tokenize_cluster_terms(node.abstract):
                counter[token] += 1
        if not counter:
            continue
        ordered_terms: list[str] = []
        for term, _ in counter.most_common():
            if term not in ordered_terms:
                ordered_terms.append(term)
            if len(ordered_terms) >= CLUSTER_LABEL_MAX_TERMS:
                break
        if len(ordered_terms) < CLUSTER_LABEL_MIN_TERMS:
            for term, _ in counter.most_common(CLUSTER_LABEL_MIN_TERMS):
                if term not in ordered_terms:
                    ordered_terms.append(term)
                if len(ordered_terms) >= CLUSTER_LABEL_MIN_TERMS:
                    break
        cluster_terms[cluster_id] = ordered_terms
    return cluster_terms


def _format_label_terms(terms: Sequence[str]) -> str:
    formatted = [" ".join(t.split()).title() for t in terms if t]
    return ", ".join(formatted)


def _match_canonical_assignees(
    conn: psycopg.Connection,
    query: str,
    *,
    threshold: float = ASSIGNEE_FUZZY_THRESHOLD,
    limit: int = ASSIGNEE_MATCH_LIMIT,
) -> tuple[list[uuid.UUID], list[str], list[tuple[str, float]]]:
    canonical = _canonicalize_assignee_for_lookup(query)
    if not canonical:
        return [], [], []
    patterns = _assignee_search_patterns(query, canonical)
    if not patterns:
        return [], [], []

    candidates: dict[str, tuple[str, float]] = {}

    def _score(name: str) -> float:
        canonical_candidate = _canonicalize_assignee_for_lookup(name)
        if not canonical_candidate:
            return 0.0
        ratio_primary = SequenceMatcher(None, canonical, canonical_candidate).ratio()
        ratio_compact = SequenceMatcher(
            None,
            canonical.replace(" ", ""),
            canonical_candidate.replace(" ", ""),
        ).ratio()
        return max(ratio_primary, ratio_compact)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, canonical_assignee_name AS label
            FROM canonical_assignee_name
            WHERE canonical_assignee_name ILIKE ANY(%s)
            ORDER BY char_length(canonical_assignee_name)
            LIMIT %s
            """,
            (patterns, max(limit * 5, limit)),
        )
        for row in cur:
            cid = str(row["id"])
            label = str(row["label"])
            score = _score(label)
            prev = candidates.get(cid)
            if prev is None or score > prev[1]:
                candidates[cid] = (label, score)

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT DISTINCT can.id, can.canonical_assignee_name AS label
            FROM assignee_alias alias
            JOIN canonical_assignee_name can ON can.id = alias.canonical_id
            WHERE alias.assignee_alias ILIKE ANY(%s)
            ORDER BY can.canonical_assignee_name
            LIMIT %s
            """,
            (patterns, max(limit * 5, limit)),
        )
        for row in cur:
            cid = str(row["id"])
            label = str(row["label"])
            score = _score(label)
            prev = candidates.get(cid)
            if prev is None or score > prev[1]:
                candidates[cid] = (label, score)

    scored = [
        (cid, label, score)
        for cid, (label, score) in candidates.items()
        if score >= threshold
    ]
    scored.sort(key=lambda item: (-item[2], len(item[1]), item[1]))

    matched_ids: list[uuid.UUID] = []
    matched_labels: list[str] = []
    matched_debug: list[tuple[str, float]] = []
    for cid, label, score in scored[:limit]:
        try:
            matched_ids.append(uuid.UUID(cid))
            matched_labels.append(label)
            matched_debug.append((label, score))
        except ValueError:
            continue
    return matched_ids, matched_labels, matched_debug


SIGNAL_LABELS: dict[SignalKind, str] = {
    "focus_shift": "Convergence Toward Focus Area",
    "emerging_gap": "Focus Area With Neighbor Underdevelopment",
    "crowd_out": "Sharply Rising Density Near Focus Area",
    "bridge": "Neighbor Linking Potential Near Focus Area",
}
SIGNAL_ORDER: tuple[SignalKind, ...] = ("emerging_gap", "bridge", "crowd_out", "focus_shift")

def pick_model(conn: psycopg.Connection, preferred: str | None = None) -> str:
    """Choose an available embedding model.

    Preference order:
    1) If `preferred` provided and exists, use it.
    2) Any model matching '%|ta' with the highest row count.
    3) Fallback: the model with the highest row count overall.
    """
    with conn.cursor() as cur:
        if preferred:
            cur.execute("SELECT 1 FROM patent_embeddings WHERE model = %s LIMIT 1", (preferred,))
            if cur.fetchone():
                return preferred

        cur.execute(
            """
            SELECT model
            FROM patent_embeddings
            WHERE model LIKE '%%|ta'
            GROUP BY model
            ORDER BY COUNT(*) DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if row and row[0]:
            return str(row[0])

        cur.execute(
            """
            SELECT model
            FROM patent_embeddings
            GROUP BY model
            ORDER BY COUNT(*) DESC
            LIMIT 1
            """
        )
        row2 = cur.fetchone()
        if not row2 or not row2[0]:
            raise HTTPException(400, "No embeddings available in the database.")
        return str(row2[0])

# --- Request and response models ---
class GraphRequest(BaseModel):
    date_from: str | None = Field(None, description="YYYY-MM-DD")
    date_to: str | None = Field(None, description="YYYY-MM-DD")
    neighbors: int = Field(
        15,
        ge=1,
        le=MAX_GRAPH_NEIGHBORS,
        description=f"KNN neighbor count (1-{MAX_GRAPH_NEIGHBORS}).",
    )
    resolution: float = 0.5
    alpha: float = 0.8
    beta: float = 0.5
    limit: int = Field(
        MAX_GRAPH_LIMIT,
        ge=1,
        le=MAX_GRAPH_LIMIT,
        description=f"Maximum rows pulled from embeddings (1-{MAX_GRAPH_LIMIT}).",
    )
    focus_keywords: list[str] = []
    focus_cpc_like: list[str] = []
    search_mode: SearchMode = Field(
        "keywords",
        description="Toggle between keyword-driven scope and assignee-driven scope.",
    )
    assignee_query: str | None = Field(
        None,
        description="Raw assignee text when search_mode='assignee'.",
    )
    layout: bool = True          # compute 2D layout for graph response
    layout_min_dist: float = 0.1 # UMAP param
    layout_neighbors: int = Field(
        25,
        ge=2,
        le=MAX_GRAPH_LAYOUT_NEIGHBORS,
        description=f"Neighborhood size for layout (2-{MAX_GRAPH_LAYOUT_NEIGHBORS}).",
    )   # UMAP param
    debug: bool = False


def _validate_graph_params(req: GraphRequest) -> None:
    violations: list[str] = []
    if not 1 <= req.limit <= MAX_GRAPH_LIMIT:
        violations.append(f"limit must be between 1 and {MAX_GRAPH_LIMIT}")
    if not 1 <= req.neighbors <= MAX_GRAPH_NEIGHBORS:
        violations.append(f"neighbors must be between 1 and {MAX_GRAPH_NEIGHBORS}")
    if not 2 <= req.layout_neighbors <= MAX_GRAPH_LAYOUT_NEIGHBORS:
        violations.append(
            f"layout_neighbors must be between 2 and {MAX_GRAPH_LAYOUT_NEIGHBORS}"
        )
    if req.search_mode == "assignee":
        if not req.assignee_query or not req.assignee_query.strip():
            violations.append("assignee_query is required when search_mode='assignee'")
    if violations:
        raise HTTPException(status_code=400, detail=violations)


class GraphNode(BaseModel):
    id: str
    cluster_id: int
    assignee: str | None = None
    x: float
    y: float
    signals: list[SignalKind] = Field(default_factory=list)
    relevance: float = 0.0
    title: str | None = None
    tooltip: str | None = None
    pub_date: date | None = None
    whitespace_score: float | None = None
    local_density: float | None = None
    abstract: str | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float


class GraphContext(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class SignalPayload(BaseModel):
    type: SignalKind
    status: Literal["none", "weak", "medium", "strong"]
    confidence: float = Field(ge=0.0, le=1.0)
    why: str
    node_ids: list[str] = Field(default_factory=list)
    debug: dict[str, float] | None = None


class AssigneeSignals(BaseModel):
    assignee: str
    k: str
    signals: list[SignalPayload]
    summary: str | None = None
    debug: dict[str, Any] | None = None
    cluster_id: int | None = None
    group_kind: GroupKind = "assignee"
    label_terms: list[str] | None = None


class WhitespaceResponse(BaseModel):
    k: str
    assignees: list[AssigneeSignals]
    graph: GraphContext | None = None
    debug: dict[str, Any] | None = None
    group_mode: GroupKind = "assignee"
    matched_assignees: list[str] | None = None

# --- Utilities ---
def _to_int_date(s: str | None) -> int | None:
    if not s:
        return None
    y, m, d = s.split("-")
    return int(f"{y}{m}{d}")


def _from_int_date(value: int | None) -> date | None:
    """Convert an integer YYYYMMDD date into a `date`."""
    if value is None:
        return None
    s = f"{value:08d}"
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None

def load_embeddings(
    conn: psycopg.Connection,
    model: str,
    req: GraphRequest,
    canonical_assignee_ids: Sequence[uuid.UUID] | None = None,
) -> tuple[np.ndarray, list[EmbeddingMeta]]:
    where = ["e.model = %s"]
    base_params: list[Any] = [model]
    df = _to_int_date(req.date_from)
    dt = _to_int_date(req.date_to)
    if df is not None:
        where.append("p.pub_date >= %s")
        base_params.append(df)
    if dt is not None:
        where.append("p.pub_date < %s")
        base_params.append(dt)
    if canonical_assignee_ids:
        where.append(
            """
            EXISTS (
              SELECT 1
              FROM patent_assignee pa
              WHERE pa.pub_id = p.pub_id
                AND pa.canonical_id = ANY(%s)
            )
            """
        )
        base_params.append(list(canonical_assignee_ids))
    # Build a focus expression to bias sampling toward focus hits
    focus_conds: list[str] = []
    if req.focus_keywords:
        kw_conds = [f"(({SEARCH_EXPR}) @@ plainto_tsquery('english', %s))" for _ in req.focus_keywords]
        if kw_conds:
            focus_conds.append("(" + " OR ".join(kw_conds) + ")")
    if req.focus_cpc_like:
        focus_conds.append(
            """
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(p.cpc) c(obj)
              WHERE (
                coalesce(obj->>'section','')||coalesce(obj->>'class','')||coalesce(obj->>'subclass','')||
                coalesce(obj->>'main_group','')||'/'||coalesce(obj->>'subgroup','')
              ) LIKE ANY(%s)
            )
            """
        )
    # params for focus expr appear after date params
    focus_params: list[Any] = []
    if req.focus_keywords:
        focus_params.extend(req.focus_keywords)
    if req.focus_cpc_like:
        focus_params.append(req.focus_cpc_like)

    focus_expr = " AND ".join(focus_conds) if focus_conds else "FALSE"

    sql = f"""
    SELECT
      e.pub_id,
      e.embedding,
      p.pub_date,
      COALESCE(can.canonical_assignee_name, p.assignee_name) AS assignee_name,
      p.title,
      p.abstract,
      ({focus_expr}) AS is_focus
    FROM patent_embeddings e
    JOIN patent p USING (pub_id)
    {CANONICAL_ASSIGNEE_LATERAL}
    WHERE {' AND '.join(where)}
    ORDER BY is_focus DESC, p.pub_date DESC, e.pub_id
    """
    params: list[Any] = []
    # IMPORTANT: Parameter order must match placeholder order in SQL string
    # Placeholders appear first in SELECT (focus_expr), then in WHERE (base_params), then LIMIT
    params.extend(focus_params)
    params.extend(base_params)
    if req.limit:
        sql += " LIMIT %s"
        params.append(req.limit)
    vecs: list[np.ndarray] = []
    meta: list[EmbeddingMeta] = []
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(_sql.SQL(sql), params) # type: ignore
        for r in cur:
            vecs.append(np.asarray(json.loads(r["embedding"]), dtype=np.float32))
            meta.append(
                EmbeddingMeta(
                    pub_id=str(r["pub_id"]),
                    is_focus=bool(r["is_focus"]),
                    pub_date=_from_int_date(r.get("pub_date")),
                    assignee=(r.get("assignee_name") or None),
                    title=(r.get("title") or None),
                    abstract=(r.get("abstract") or None),
                )
            )
    if not vecs:
        raise HTTPException(400, "No embeddings match the filters.")
    X = np.vstack(vecs)
    # cosine normalization
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    X = X / norms
    return X, meta

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


def compute_whitespace_metrics(
    X: np.ndarray,
    labels: np.ndarray,
    dens: np.ndarray,
    focus_mask: np.ndarray,
    alpha: float,
    beta: float,
    momentum: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
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
    return score.astype(np.float32), proximity, d.astype(np.float32), F.astype(np.float32)

def _persist_sync(
    conn: psycopg.Connection,
    pub_ids: list[str],
    model: str,
    dist: np.ndarray,
    idx: np.ndarray,
    labels: np.ndarray,
    dens: np.ndarray,
    scores: np.ndarray,
    user_id: str,
) -> None:
    """psycopg3 COPY-based upsert for edges and label/score updates."""
    k = idx.shape[1]

    with conn.cursor() as cur:
        # 1) Temp edges
        cur.execute("""
            CREATE TEMP TABLE tmp_edges(
              user_id text,
              src text,
              dst text,
              w   real
            ) ON COMMIT DROP
        """)
        with cur.copy("COPY tmp_edges (user_id, src, dst, w) FROM STDIN") as cp:
            for i, src in enumerate(pub_ids):
                for jpos in range(k):
                    j = int(idx[i, jpos])
                    if i == j:
                        continue
                    cp.write_row((user_id, src, pub_ids[j], float(1.0 - dist[i, jpos])))

        # Upsert edges with user_id
        cur.execute("""
            INSERT INTO knn_edge(user_id, src, dst, w)
            SELECT user_id, src, dst, w FROM tmp_edges
            ON CONFLICT (user_id, src, dst) DO UPDATE SET w = EXCLUDED.w
        """)

        # 2) Temp updates for user-specific whitespace analysis
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

        # Upsert into user_whitespace_analysis table (user-specific)
        cur.execute("""
            INSERT INTO user_whitespace_analysis (user_id, pub_id, model, cluster_id, local_density, whitespace_score, updated_at)
            SELECT %s, pub_id, %s, cluster_id, local_density, whitespace_score, NOW()
            FROM tmp_updates
            ON CONFLICT (user_id, pub_id, model)
            DO UPDATE SET
                cluster_id = EXCLUDED.cluster_id,
                local_density = EXCLUDED.local_density,
                whitespace_score = EXCLUDED.whitespace_score,
                updated_at = NOW()
        """, (user_id, model))

    conn.commit()


def _persist_background(
    pool: ConnectionPool,
    model: str,
    pub_ids: Sequence[str],
    dist: np.ndarray,
    idx: np.ndarray,
    labels: np.ndarray,
    dens: np.ndarray,
    scores: np.ndarray,
    user_id: str,
) -> None:
    try:
        with pool.connection() as conn:
            _persist_sync(
                conn,
                list(pub_ids),
                model,
                dist,
                idx,
                labels,
                dens,
                scores,
                user_id,
            )
    except Exception:
        logger.exception("Failed to persist whitespace metrics")


# --- Endpoints ---


def _ensure_active_subscription(conn: psycopg.Connection, user_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT has_active_subscription(%s)", (user_id,))
        row = cur.fetchone()
    if not row or not bool(row[0]):
        raise SubscriptionRequiredError(
            detail="This feature requires an active subscription. Please subscribe to continue."
        )


def _normalize_assignee(name: str | None) -> str:
    """Coalesce empty assignee labels into a friendly placeholder."""
    if not name:
        return "Unknown assignee"
    cleaned = name.strip()
    return cleaned or "Unknown assignee"


def _parse_date_str(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _month_floor(d: date) -> date:
    return date(d.year, d.month, 1)


def _window_bounds(req: GraphRequest, nodes: Sequence[NodeDatum]) -> tuple[date | None, date | None]:
    """Determine the rolling window used for time-series evaluation."""
    dated_nodes = [n for n in nodes if n.pub_date]
    if not dated_nodes:
        return None, None
    latest = max(n.pub_date for n in dated_nodes if n.pub_date)  # type: ignore[arg-type]
    earliest = min(n.pub_date for n in dated_nodes if n.pub_date)  # type: ignore[arg-type]
    req_end = _parse_date_str(req.date_to)
    end_date = min(latest, req_end) if req_end else latest
    req_start = _parse_date_str(req.date_from)
    span_days = 365
    if req_start and req_start <= end_date:
        span = (end_date - req_start).days
        span_days = min(max(span, 180), 365) if span > 0 else 365
        base_start = end_date - timedelta(days=span_days)
        start_date = max(req_start, base_start)
    else:
        start_date = end_date - timedelta(days=365)
    if start_date < earliest:
        start_date = earliest
    if (end_date - start_date).days < 60:
        # Require at least ~2 months to avoid spurious slopes.
        return None, None
    return start_date, end_date


def _build_node_data(
    meta: Sequence[EmbeddingMeta],
    labels: np.ndarray,
    scores: np.ndarray,
    dens: np.ndarray,
    proximity: np.ndarray,
    distance: np.ndarray,
    momentum: np.ndarray,
) -> list[NodeDatum]:
    """Combine raw arrays into a richer per-node structure."""
    nodes: list[NodeDatum] = []
    for idx, m in enumerate(meta):
        cid = int(labels[idx])
        nodes.append(
            NodeDatum(
                index=idx,
                pub_id=m.pub_id,
                assignee=_normalize_assignee(m.assignee),
                pub_date=m.pub_date,
                cluster_id=cid,
                score=float(scores[idx]),
                density=float(dens[idx]),
                proximity=float(proximity[idx]),
                distance=float(distance[idx]),
                momentum=float(momentum[cid]) if cid < len(momentum) else 0.0,
                is_focus=bool(m.is_focus),
                title=m.title,
                abstract=m.abstract,
            )
        )
    return nodes


def _compute_bridge_inputs(
    assignee_indices: Sequence[int],
    labels: np.ndarray,
    idx_matrix: np.ndarray,
    dist_matrix: np.ndarray,
    momentum: np.ndarray,
) -> tuple[float, float, float, float, set[int]]:
    """Return bridge rule inputs and the indices of interface nodes."""
    if not assignee_indices:
        return 1.0, 0.0, 0.0, 0.0, set()
    cluster_counts = Counter(int(labels[i]) for i in assignee_indices)
    if len(cluster_counts) < 2:
        return 1.0, 0.0, 0.0, 0.0, set()
    top_clusters = [cid for cid, _ in cluster_counts.most_common(2)]
    c1, c2 = top_clusters[0], top_clusters[1]
    bridge_nodes: set[int] = set()
    weights: list[float] = []
    for node_idx in assignee_indices:
        node_cluster = int(labels[node_idx])
        if node_cluster not in top_clusters:
            continue
        for neighbor_pos, neighbor_idx in enumerate(idx_matrix[node_idx]):
            if int(neighbor_idx) == node_idx:
                continue
            neighbor_cluster = int(labels[neighbor_idx])
            if neighbor_cluster not in top_clusters or neighbor_cluster == node_cluster:
                continue
            weight = float(1.0 - dist_matrix[node_idx, neighbor_pos])
            weights.append(weight)
            bridge_nodes.add(node_idx)
    cluster_total = sum(1 for i in assignee_indices if int(labels[i]) in top_clusters)
    openness = float(len(bridge_nodes) / max(1, cluster_total))
    inter_weight = float(np.mean(weights)) if weights else 0.0
    mom_left = float(momentum[c1]) if c1 < len(momentum) else 0.0
    mom_right = float(momentum[c2]) if c2 < len(momentum) else 0.0
    return openness, inter_weight, mom_left, mom_right, bridge_nodes


def build_group_signals(
    req: GraphRequest,
    node_data: list[NodeDatum],
    labels: np.ndarray,
    idx_matrix: np.ndarray,
    dist_matrix: np.ndarray,
    momentum: np.ndarray,
    *,
    scope_text: str,
    group_mode: GroupKind,
    cluster_label_map: dict[int, list[str]] | None = None,
) -> tuple[list[AssigneeSignals], dict[str, set[SignalKind]], dict[str, float], dict[str, str]]:
    """Aggregate node-level metrics into signal payloads per grouping unit."""
    if not node_data:
        return [], {}, {}, {}

    cluster_label_map = cluster_label_map or {}
    cohort_scores = np.array([n.score for n in node_data], dtype=float)
    density_values = np.array([n.density for n in node_data], dtype=float)
    if cohort_scores.size == 0:
        cohort_scores = np.array([0.0], dtype=float)
    if density_values.size == 0:
        density_values = np.array([0.0], dtype=float)

    cohort_scores_list = cohort_scores.tolist()
    high_ws_threshold = float(np.quantile(cohort_scores, 0.90))
    low_ws_threshold = float(np.quantile(cohort_scores, 0.40))
    high_density_threshold = float(np.quantile(density_values, 0.75))

    data_by_group: dict[str, list[NodeDatum]] = defaultdict(list)
    group_meta: dict[str, dict[str, Any]] = {}

    for node in node_data:
        if group_mode == "cluster":
            key = f"cluster:{node.cluster_id}"
            label_terms = cluster_label_map.get(node.cluster_id, [])
            trimmed_terms = label_terms[:CLUSTER_LABEL_MAX_TERMS]
            formatted_terms = _format_label_terms(trimmed_terms) if trimmed_terms else ""
            label_text = f"Cluster {node.cluster_id}"
            if formatted_terms:
                label_text = f"{label_text} • {formatted_terms}"
            if key not in group_meta:
                group_meta[key] = {
                    "label": label_text,
                    "cluster_id": node.cluster_id,
                    "terms": list(trimmed_terms),
                    "formatted_terms": formatted_terms,
                }
        else:
            key = node.assignee
            if key not in group_meta:
                group_meta[key] = {
                    "label": node.assignee,
                    "cluster_id": None,
                    "terms": None,
                    "formatted_terms": None,
                }
        data_by_group[key].append(node)

    def _sort_key(group_key: str) -> tuple[int, str]:
        label_text = group_meta[group_key]["label"] or ""
        return (-len(data_by_group[group_key]), label_text.lower())

    ordered_groups = sorted(data_by_group.keys(), key=_sort_key)
    group_limit = 6 if group_mode == "cluster" else 5
    ordered_groups = ordered_groups[:group_limit]

    group_payloads: list[AssigneeSignals] = []
    node_signals: dict[str, set[SignalKind]] = defaultdict(set)
    node_relevance: dict[str, float] = defaultdict(float)
    node_tooltips: dict[str, str] = {}

    for group_key in ordered_groups:
        nodes = sorted(data_by_group[group_key], key=lambda n: (n.pub_date or date.min, n.pub_id))
        start_date, end_date = _window_bounds(req, nodes)
        meta_info = group_meta[group_key]
        group_label = meta_info["label"]
        cluster_id = meta_info["cluster_id"]
        label_terms = meta_info["terms"]
        formatted_terms = meta_info["formatted_terms"]
        summary_text: str | None = None
        if group_mode == "cluster" and formatted_terms:
            summary_text = f"Top terms: {formatted_terms}"

        if not start_date or not end_date:
            focus_result = SignalComputation(False, 0.0, "Not enough history for this scope.", {"samples": 0.0})
            emerging_result = SignalComputation(False, 0.0, "Not enough history for this scope.", {"samples": 0.0})
            crowd_result = SignalComputation(False, 0.0, "Not enough history for this scope.", {"samples": 0.0})
            bridge_result = SignalComputation(False, 0.0, "Not enough history for this scope.", {"samples": 0.0})
            signal_payloads: list[SignalPayload] = [
                SignalPayload(type="emerging_gap", status=emerging_result.status(), confidence=0.0, why=emerging_result.message, node_ids=[]),
                SignalPayload(type="bridge", status=bridge_result.status(), confidence=0.0, why=bridge_result.message, node_ids=[]),
                SignalPayload(type="crowd_out", status=crowd_result.status(), confidence=0.0, why=crowd_result.message, node_ids=[]),
                SignalPayload(type="focus_shift", status=focus_result.status(), confidence=0.0, why=focus_result.message, node_ids=[]),
            ]
            group_payloads.append(
                AssigneeSignals(
                    assignee=group_label,
                    k=scope_text,
                    signals=signal_payloads,
                    summary=summary_text,
                    cluster_id=cluster_id,
                    group_kind=group_mode,
                    label_terms=list(label_terms) if label_terms else None,
                )
            )
            continue

        window_nodes = [n for n in nodes if n.pub_date and start_date <= n.pub_date <= end_date]
        if not window_nodes:
            continue

        bucket_map: dict[date, list[NodeDatum]] = defaultdict(list)
        for node in window_nodes:
            bucket_map[_month_floor(node.pub_date)].append(node)  # type: ignore[arg-type]
        bucket_items = sorted(bucket_map.items())
        if len(bucket_items) > 12:
            bucket_items = bucket_items[-12:]

        dist_series: list[float] = []
        share_series: list[float] = []
        whitespace_series: list[float] = []
        density_series: list[float] = []
        momentum_series: list[float] = []
        n_samples = 0
        latest_nodes: list[NodeDatum] = []

        for _, bucket_nodes in bucket_items:
            count = len(bucket_nodes)
            if count == 0:
                continue
            n_samples += count
            dist_series.append(float(np.mean([n.distance for n in bucket_nodes])))
            share_series.append(sum(1 for n in bucket_nodes if n.is_focus) / count)
            whitespace_series.append(float(np.mean([n.score for n in bucket_nodes])))
            density_series.append(float(np.mean([n.density for n in bucket_nodes])))
            momentum_series.append(float(np.mean([n.momentum for n in bucket_nodes])))
            latest_nodes = bucket_nodes

        neighbor_momentum = momentum_series[-1] if momentum_series else 0.0

        focus_result = signal_focus_shift(dist_series, share_series, n_samples)
        emerging_result = signal_emerging_gap(whitespace_series, cohort_scores_list, neighbor_momentum)
        crowd_result = signal_crowd_out(whitespace_series, density_series)

        group_indices = [n.index for n in nodes]
        openness, inter_weight, mom_left, mom_right, bridge_node_indices = _compute_bridge_inputs(
            group_indices, labels, idx_matrix, dist_matrix, momentum
        )
        bridge_result = signal_bridge(openness, inter_weight, mom_left, mom_right)

        index_lookup = {n.index: n for n in nodes}

        focus_node_ids = [n.pub_id for n in sorted(latest_nodes, key=lambda n: n.distance)[:6]]
        emerging_candidates = [n for n in nodes if n.score >= high_ws_threshold and n.proximity >= 0.4]
        if not emerging_candidates:
            emerging_candidates = sorted(nodes, key=lambda n: n.score, reverse=True)[:5]
        emerging_node_ids = [n.pub_id for n in emerging_candidates[:6]]
        crowd_candidates = [
            n for n in latest_nodes
            if (n.density >= high_density_threshold and n.score <= low_ws_threshold)
        ]
        if not crowd_candidates:
            crowd_candidates = sorted(latest_nodes, key=lambda n: (n.density, -n.score), reverse=True)[:5]
        crowd_node_ids = [n.pub_id for n in crowd_candidates[:6]]
        bridge_node_ids = [index_lookup[idx].pub_id for idx in bridge_node_indices if idx in index_lookup]

        def _payload(kind: SignalKind, result: SignalComputation, node_ids: list[str]) -> SignalPayload:
            conf = float(np.clip(result.confidence, 0.0, 1.0))
            payload = SignalPayload(
                type=kind,
                status=result.status(),
                confidence=conf,
                why=result.message,
                node_ids=node_ids,
                debug=result.debug if req.debug else None,
            )
            for nid in node_ids:
                tooltip_msg = f"{SIGNAL_LABELS[kind]}: {result.message}"
                current_conf = node_relevance.get(nid, 0.0)
                node_signals[nid].add(kind)
                if conf >= current_conf:
                    node_tooltips[nid] = tooltip_msg
                node_relevance[nid] = max(current_conf, conf)
            return payload

        signal_payloads = [
            _payload("emerging_gap", emerging_result, emerging_node_ids),
            _payload("bridge", bridge_result, bridge_node_ids),
            _payload("crowd_out", crowd_result, crowd_node_ids),
            _payload("focus_shift", focus_result, focus_node_ids),
        ]

        group_debug: dict[str, Any] | None = None
        if req.debug:
            group_debug = {
                "window_start": start_date.isoformat(),
                "window_end": end_date.isoformat(),
                "dist_series": dist_series,
                "share_series": share_series,
                "whitespace_series": whitespace_series,
                "density_series": density_series,
                "momentum_series": momentum_series,
                "neighbor_momentum": neighbor_momentum,
                "high_ws_threshold": high_ws_threshold,
                "low_ws_threshold": low_ws_threshold,
                "high_density_threshold": high_density_threshold,
                "bridge_inputs": {
                    "openness": openness,
                    "inter_weight": inter_weight,
                    "momentum_left": mom_left,
                    "momentum_right": mom_right,
                },
            }
        group_payloads.append(
            AssigneeSignals(
                assignee=group_label,
                k=scope_text,
                signals=signal_payloads,
                summary=summary_text,
                debug=group_debug,
                cluster_id=cluster_id,
                group_kind=group_mode,
                label_terms=list(label_terms) if label_terms else None,
            )
        )

    return group_payloads, node_signals, node_relevance, node_tooltips

@router.post("/graph", response_model=WhitespaceResponse)
def get_whitespace_graph(
    req: GraphRequest,
    pool: Annotated[ConnectionPool, Depends(get_pool)],
    background_tasks: BackgroundTasks,
    current_user: User,
) -> WhitespaceResponse:
    _validate_graph_params(req)

    # Extract user_id from JWT token (Auth0 uses 'sub' claim for user ID)
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in authentication token")

    group_mode: GroupKind = "assignee"
    matched_canonical_ids: list[uuid.UUID] | None = None
    matched_labels: list[str] = []
    matched_debug: list[tuple[str, float]] = []

    with pool.connection() as conn:
        try:
            _ensure_active_subscription(conn, user_id)
            model = pick_model(conn, preferred=os.getenv("WS_EMBEDDING_MODEL", "text-embedding-3-small|ta"))
            if req.search_mode == "assignee":
                group_mode = "cluster"
                matched_canonical_ids, matched_labels, matched_debug = _match_canonical_assignees(
                    conn, req.assignee_query or ""
                )
                if not matched_canonical_ids:
                    raise HTTPException(
                        status_code=404,
                        detail="No canonical assignee matches found above the similarity threshold.",
                    )
            X, meta = load_embeddings(conn, model, req, matched_canonical_ids)
        except psycopg.errors.UndefinedTable as exc:
            logger.error("Whitespace schema missing; run database migrations before serving traffic.")
            raise HTTPException(
                status_code=500,
                detail="Whitespace graph schema is not initialized. Run database migrations.",
            ) from exc
        except psycopg.errors.InsufficientPrivilege as exc:
            logger.error("Database role lacks privileges for whitespace query: %s", exc)
            raise HTTPException(
                status_code=500,
                detail="Database role is missing privileges required for whitespace queries.",
            ) from exc
        focus_mask = np.array([m.is_focus for m in meta], dtype=bool)
        pub_ids = [m.pub_id for m in meta]
        point_count = len(pub_ids)

        if point_count < 2:
            raise HTTPException(status_code=400, detail="Not enough embeddings to build whitespace graph.")
        if req.neighbors >= point_count:
            raise HTTPException(
                status_code=400,
                detail=f"neighbors must be less than the number of embeddings ({point_count})",
            )
        if req.layout_neighbors >= point_count:
            raise HTTPException(
                status_code=400,
                detail=f"layout_neighbors must be less than the number of embeddings ({point_count})",
            )

        dist, idx = build_knn(X, req.neighbors)
        labels = cluster_labels(dist, idx, req.resolution)
        dens = local_density(dist)
        mom = neighbor_momentum(conn, pub_ids, labels)
        scores, proximity, distance, focus_vector = compute_whitespace_metrics(
            X, labels, dens, focus_mask, req.alpha, req.beta, mom
        )

    # layout
    if req.layout and _HAVE_UMAP:
        reducer = umap.UMAP(
            n_neighbors=req.layout_neighbors,
            min_dist=req.layout_min_dist,
            metric="cosine",
            random_state=42,
        )
        embedding = reducer.fit_transform(X)
        XY = np.asarray(embedding).astype(np.float32)
    else:
        # PCA 2D fallback
        mu = X.mean(axis=0, keepdims=True)
        Xc = X - mu
        U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
        XY = (Xc @ Vt[:2].T).astype(np.float32)

    node_data = _build_node_data(meta, labels, scores, dens, proximity, distance, mom)
    cluster_term_map = _compute_cluster_term_map(node_data) if group_mode == "cluster" else {}

    if group_mode == "cluster":
        if matched_labels:
            display_labels = matched_labels[:6]
            scope_text = f"Matched assignees: {', '.join(display_labels)}"
            remaining = len(matched_labels) - len(display_labels)
            if remaining > 0:
                scope_text += f" (+{remaining} more)"
        else:
            scope_text = f"Assignee scope: {req.assignee_query or 'Selected scope'}"
    else:
        scope_text = ", ".join(req.focus_keywords) or ", ".join(req.focus_cpc_like) or "Selected scope"

    group_payloads, node_signal_map, node_relevance_map, node_tooltips = build_group_signals(
        req,
        node_data,
        labels,
        idx,
        dist,
        mom,
        scope_text=scope_text,
        group_mode=group_mode,
        cluster_label_map=cluster_term_map,
    )

    if not group_payloads and node_data:
        empty_signals = [
            SignalPayload(type=kind, status="none", confidence=0.0, why="No signal detected for this scope.", node_ids=[])
            for kind in SIGNAL_ORDER
        ]
        fallback_label = (
            node_data[0].assignee if group_mode == "assignee" else f"Cluster {node_data[0].cluster_id}"
        )
        group_payloads = [
            AssigneeSignals(
                assignee=fallback_label,
                k=scope_text,
                signals=empty_signals,
                debug=None,
                cluster_id=node_data[0].cluster_id if group_mode == "cluster" else None,
                group_kind=group_mode,
            )
        ]

    nodes = []
    for i, meta_row in enumerate(meta):
        node_id = meta_row.pub_id
        signal_list = sorted(node_signal_map.get(node_id, []))
        relevance = node_relevance_map.get(node_id, 0.0)
        if relevance <= 0:
            relevance = 0.15
        datum = node_data[i]
        nodes.append(
            GraphNode(
                id=node_id,
                cluster_id=int(labels[i]),
                assignee=_normalize_assignee(meta_row.assignee),
                x=float(XY[i, 0]),
                y=float(XY[i, 1]),
                signals=signal_list,
                relevance=float(np.clip(relevance, 0.05, 1.0)),
                title=meta_row.title,
                tooltip=node_tooltips.get(node_id),
                pub_date=datum.pub_date,
                whitespace_score=datum.score,
                local_density=datum.density,
                abstract=meta_row.abstract,
            )
        )

    edges = []
    for i, src in enumerate(pub_ids):
        for j_idx, j in enumerate(idx[i, 1:11]):  # at most 10 edges
            edges.append(
                GraphEdge(
                    source=src,
                    target=pub_ids[j],
                    weight=float(1.0 - dist[i, j_idx + 1]),
                )
            )

    background_tasks.add_task(
        _persist_background,
        pool,
        model,
        list(pub_ids),
        dist,
        idx,
        labels,
        dens,
        scores,
        user_id,
    )

    debug_payload: dict[str, Any] | None = None
    if req.debug:
        debug_payload = {
            "focus_mask_count": int(focus_mask.sum()),
            "total_nodes": len(nodes),
            "alpha": req.alpha,
            "beta": req.beta,
            "focus_vector_norm": float(np.linalg.norm(focus_vector)),
        }

    graph_context = GraphContext(nodes=nodes, edges=edges)
    if req.debug and matched_debug:
        debug_payload = debug_payload or {}
        debug_payload["matched_assignees"] = [
            {"name": name, "score": score} for name, score in matched_debug
        ]

    return WhitespaceResponse(
        k=scope_text,
        assignees=group_payloads,
        graph=graph_context,
        debug=debug_payload,
        group_mode=group_mode,
        matched_assignees=matched_labels or None,
    )
