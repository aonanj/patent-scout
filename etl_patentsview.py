#!/usr/bin/env python3
"""
etl_patentsview_to_postgres.py

PatentsView → Postgres loader for Patent Scout MVP with optional:
- claims ingestion (PatentsView g_claim/pg_claim)
- embeddings generation (OpenAI) for title+abstract and claims

Idempotent:
- Upsert into patent
- Log stages in ingest_log
- Skip existing embeddings (per pub_id, model)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple, TypeAlias

import psycopg
from dotenv import load_dotenv
from openai import OpenAI  # type: ignore
from psycopg import Connection
from psycopg.rows import TupleRow
from psycopg_pool import ConnectionPool  # type: ignore
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# -----------------------
# Configuration constants
# -----------------------
load_dotenv()

AI_CPC_REGEX_DEFAULT = r"^(G06N|G06V|G06F17|G06F18|G06F40|G06F16/90|G06K9|G06T7|G10L|A61B|B60W|G05D)"

PATENTSVIEW_BASE = os.getenv("PATENTSVIEW_BASE", "https://search.patentsview.org/api/v1")
PV_PATENTS_ENDPOINT = os.getenv("PV_PATENTS_ENDPOINT", f"{PATENTSVIEW_BASE}/patents")
PV_GCLAIM_ENDPOINT = os.getenv("PV_GCLAIM_ENDPOINT", f"{PATENTSVIEW_BASE}/g_claim")
PV_PGCLAIM_ENDPOINT = os.getenv("PV_PGCLAIM_ENDPOINT", f"{PATENTSVIEW_BASE}/pg_claim")
PV_TIMEOUT = int(os.getenv("PV_TIMEOUT", "60"))
PV_PAGE_SIZE = int(os.getenv("PV_PAGE_SIZE", "200"))  # server may cap lower
PV_API_KEY = os.getenv("PATENTSVIEW_API_KEY")  # optional

EMB_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMB_DIM_HINT = int(os.getenv("EMBEDDING_DIM_HINT", "1024"))  # hint only
EMB_BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "64"))

PgConn: TypeAlias = Connection[TupleRow]

UPSERT_SQL = """
INSERT INTO patent (
    pub_id,
    application_number,
    priority_date,
    family_id,
    kind_code,
    pub_date,
    filing_date,
    title,
    abstract,
    claims_text,
    assignee_name,
    inventor_name,
    cpc
) VALUES (
    %(pub_id)s,
    %(application_number)s,
    %(priority_date)s,
    %(family_id)s,
    %(kind_code)s,
    %(pub_date)s,
    %(filing_date)s,
    %(title)s,
    %(abstract)s,
    %(claims_text)s,
    %(assignee_name)s,
    %(inventor_name)s::jsonb,
    %(cpc)s::jsonb
)
ON CONFLICT (pub_id) DO UPDATE SET
    application_number = COALESCE(EXCLUDED.application_number, patent.application_number),
    priority_date     = COALESCE(EXCLUDED.priority_date,     patent.priority_date),
    family_id         = COALESCE(EXCLUDED.family_id,         patent.family_id),
    kind_code         = COALESCE(EXCLUDED.kind_code,         patent.kind_code),
    pub_date          = COALESCE(EXCLUDED.pub_date,          patent.pub_date),
    filing_date       = COALESCE(EXCLUDED.filing_date,       patent.filing_date),
    title             = COALESCE(NULLIF(EXCLUDED.title, ''), patent.title),
    abstract          = COALESCE(EXCLUDED.abstract,          patent.abstract),
    claims_text       = COALESCE(EXCLUDED.claims_text,       patent.claims_text),
    assignee_name     = COALESCE(EXCLUDED.assignee_name,     patent.assignee_name),
    inventor_name     = COALESCE(EXCLUDED.inventor_name,     patent.inventor_name),
    cpc               = COALESCE(EXCLUDED.cpc,               patent.cpc)
"""
INGEST_LOG_SQL = """
INSERT INTO ingest_log (pub_id, stage, content_hash, detail, created_at)
VALUES (%(pub_id)s, %(stage)s, %(content_hash)s, %(detail)s, NOW())
ON CONFLICT (pub_id, stage) DO UPDATE SET
  content_hash = EXCLUDED.content_hash,
  detail = EXCLUDED.detail,
  created_at = NOW();
"""
UPDATE_CLAIMS_SQL = """
UPDATE patent
SET claims_text = %(claims_text)s,
    updated_at = NOW()
WHERE id = %(id)s;
"""
UPSERT_EMBEDDINGS_SQL = """
INSERT INTO patent_embeddings (pub_id, model, dim, embedding, created_at)
VALUES (%(pub_id)s, %(model)s, %(dim)s, CAST(%(embedding)s AS vector), NOW())
ON CONFLICT (pub_id, model)
DO UPDATE SET dim = EXCLUDED.dim,
              embedding = EXCLUDED.embedding,
              created_at = NOW();
"""
# --------------
# Data structures
# --------------

@dataclass(frozen=True)
class PatentRecord:
    pub_id: str
    application_number: Optional[str]
    priority_date: Optional[int]
    family_id: Optional[str]
    filing_date: Optional[int]
    kind_code: Optional[str]
    title: Optional[str]
    abstract: Optional[str]
    assignee_name: Optional[str]
    inventor_name: List[str]
    pub_date: int
    cpc: Sequence[Mapping[str, Optional[str]]]
    claims_text: Optional[str]


# -----------

# Utilities
# -----------

_DIGITS = re.compile(r"\d+")


def _iso_to_date(s: str) -> date:
    if "-" in s:
        return datetime.strptime(s, "%Y-%m-%d").date()
    return datetime.strptime(s, "%Y%m%d").date()

def _parse_cpc_code(code: str) -> Mapping[str, Optional[str]]:
    """
    Parse a CPC code like 'G06N3/08' into components.
    Returns dict with keys: section, class, subclass, group, subgroup.
    Missing parts become None.
    """
    s = code.replace(" ", "").upper()
    # Pattern: Section(A-Z) Class(2 digits) Subclass(A-Z) Group(int) Optional /Subgroup(int)
    m = re.match(r"^([A-HY])(\d{2})([A-Z])(\d+)(?:/(\d+))?$", s)
    if not m:
        return {
            "section": None,
            "class": None,
            "subclass": None,
            "group": None,
            "subgroup": None,
        }
    section, cls, subclass, group, subgroup = m.groups()
    return {
        "section": section,
        "class": cls,
        "subclass": subclass,
        "group": group,
        "subgroup": subgroup,
    }

def _clean_claims(claims: Optional[str]) -> Optional[str]:
    if not claims:
        return None
    claims_clean = None
    if "what is claimed is" in claims.lower():
        claims_clean = re.sub(r"^\s*what is claimed is:?\s*", "", claims, flags=re.IGNORECASE)
    elif "what is claimed" in claims.lower():
        claims_clean = re.sub(r"^\s*what is claimed:?\s*", "", claims, flags=re.IGNORECASE)
    elif "the invention claimed is" in claims.lower():
        claims_clean = re.sub(r"^\s*the invention claimed is:?\s*", "", claims, flags=re.IGNORECASE)
    elif "we claim" in claims.lower():
        claims_clean = re.sub(r"^\s*we claim:?\s*", "", claims, flags=re.IGNORECASE)
    elif "i claim" in claims.lower():
        claims_clean = re.sub(r"^\s*i claim:?\s*", "", claims, flags=re.IGNORECASE)
    elif "that which is claimed is" in claims.lower():
        claims_clean = re.sub(r"^\s*that which is claimed is:?\s*", "", claims, flags=re.IGNORECASE)
    elif "having thus described the invention what is claimed as new and desired to be secured by letters patent is as follows" in claims.lower():
        claims_clean = re.sub(r"^\s*having thus described the invention what is claimed as new and desired to be secured by letters patent is as follows:?\s*", "", claims, flags=re.IGNORECASE)
    elif "having thus described the invention, what is claimed is" in claims.lower():
        claims_clean = re.sub(r"^\s*having thus described the invention, what is claimed is:?\s*", "", claims, flags=re.IGNORECASE)
    elif "it is claimed" in claims.lower():
        claims_clean = re.sub(r"^\s*it is claimed:?\s*", "", claims, flags=re.IGNORECASE)
    elif "therefore, the following is claimed" in claims.lower():
        claims_clean = re.sub(r"^\s*therefore, the following is claimed:?\s*", "", claims, flags=re.IGNORECASE)
    elif "the following is claimed" in claims.lower():
        claims_clean = re.sub(r"^\s*the following is claimed:?\s*", "", claims, flags=re.IGNORECASE)
    elif "the embodiments of the invention in which an exclusive property or privilege is claimed are defined as follows" in claims.lower():
        claims_clean = re.sub(r"^\s*the embodiments of the invention in which an exclusive property or privilege is claimed are defined as follows:?\s*", "", claims, flags=re.IGNORECASE)
    elif "the claimed invention is:" in claims.lower():
        claims_clean = re.sub(r"^\s*the claimed invention is:?\s*", "", claims, flags=re.IGNORECASE)
    return claims_clean.strip() if claims_clean else claims.strip()


def _to_record(row: bigquery.Row) -> PatentRecord:
    cpc_struct = [_parse_cpc_code(c) for c in (row["cpc_codes"] or [])]
    return PatentRecord(
        pub_id=row["pub_id"],
        application_number=row.get("application_number"),
        priority_date=row.get("priority_date"),
        family_id=row.get("family_id"),
        kind_code=row.get("kind_code"),
        pub_date=row["pub_date"],
        filing_date=row.get("filing_date"),
        title=row["title"] or "",
        abstract=row.get("abstract"),
        claims_text=_clean_claims(row.get("claims_text")),
        assignee_name=row.get("assignee_name"),
        inventor_name=list(row.get("inventor_names") or []),
        cpc=cpc_struct,
    )


def chunked(iterable: Iterable, size: int) -> Iterator[List]:
    buf: List = []
    for item in iterable:
        buf.append(item)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


def content_hash(rec: PatentRecord) -> str:
    payload = json.dumps(
        {
            "pub_id": rec.pub_id,
            "kind_code": rec.kind_code or "",
            "title": rec.title or "",
            "abstract": rec.abstract or "",
            "assignee_name": rec.assignee_name or "",
            "cpc": [c.get("code", "") for c in rec.cpc],
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def claims_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def pub_to_docnum(pub_id: str) -> str:
    return "".join(_DIGITS.findall(pub_id))


def is_pregrant(kind_code: Optional[str]) -> bool:
    if not kind_code:
        return True
    return kind_code.upper().startswith("A")


def clamp_text(s: str, max_chars: int = EMB_MAX_CHARS) -> str:
    if len(s) <= max_chars:
        return s
    # Prefer cutting at a whitespace boundary
    cutoff = s.rfind(" ", 0, max_chars)
    return s[: (cutoff if cutoff > 0 else max_chars)]


def split_by_words(s: str, words_per_chunk: int = 900) -> List[str]:
    """Approximate token-based chunking without external deps."""
    ws = s.split()
    return [" ".join(ws[i : i + words_per_chunk]) for i in range(0, len(ws), words_per_chunk)]


def vec_to_literal(v: Sequence[float]) -> str:
    # pgvector accepts '[v1,v2,...]' text literal
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"


def average_vectors(rows: Sequence[Sequence[float]]) -> List[float]:
    if not rows:
        return []
    dim = len(rows[0])
    acc = [0.0] * dim
    for r in rows:
        for i, x in enumerate(r):
            acc[i] += float(x)
    n = float(len(rows))
    return [x / n for x in acc]


# ----------------------
# BigQuery query stage
# ----------------------

def query_bigquery(
    client: bigquery.Client,
    date_from: str,
    date_to: str,
    cpc_regex: str,
) -> Iterator[PatentRecord]:
    print(f"Querying BigQuery from {date_from} to {date_to} with CPC regex {cpc_regex}", file=sys.stderr)
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("date_from", "STRING", date_from),
            bigquery.ScalarQueryParameter("date_to", "STRING", date_to),
            bigquery.ScalarQueryParameter("cpc_regex", "STRING", cpc_regex),
        ]
    )
    job = client.query(BQ_SQL_TEMPLATE, job_config=job_config)
    for row in job.result(page_size=BQ_PAGE_SIZE):
        yield _to_record(row)


# ----------------------
# Postgres upsert stage
# ----------------------

def upsert_batch(pool, records):
    print("Upserting batch of", len(records), "records", file=sys.stderr)
    CHUNK = 20  
    with pool.connection() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(records), CHUNK):
                chunk = records[i:i+CHUNK]
                rows = [{
                    "pub_id": r.pub_id,
                    "application_number": r.application_number,
                    "priority_date": r.priority_date,
                    "family_id": r.family_id,
                    "filing_date": r.filing_date,
                    "kind_code": r.kind_code,
                    "pub_date": r.pub_date,
                    "title": r.title,
                    "abstract": r.abstract,
                    "assignee_name": r.assignee_name,
                    "inventor_name": json.dumps(list(r.inventor_name), ensure_ascii=False),
                    "cpc": json.dumps(list(r.cpc), ensure_ascii=False),
                    "claims_text": r.claims_text,
                } for r in chunk]

                try:
                    cur.executemany(UPSERT_SQL, rows)  
                    cur.executemany(INGEST_LOG_SQL, [{
                        "pub_id": rec.pub_id,
                        "stage": "inserted",
                        "content_hash": content_hash(rec),
                        "detail": json.dumps({"source": "bigquery"}, ensure_ascii=False),
                    } for rec in chunk])
                except Exception as e:
                    print(f"Error upserting chunk starting with pub_id {chunk[0].pub_id}: {e}", file=sys.stderr)
                    continue

        conn.commit()



def latest_watermark(conn_str: str) -> Optional[date]:
    sql = "SELECT max(pub_date) FROM patent;"
    with psycopg.connect(conn_str) as conn, conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone()
    int_wm = row[0] if row and row[0] is not None else None
    print(f"Latest watermark from Postgres: {int_wm}", file=sys.stderr)
    if int_wm is not None:
        str_wm = str(int_wm)
        dt_wm = datetime.strptime(str_wm, "%Y%m%d").date()
    
        return dt_wm

# --------------------------


# Minimal helpers preserved from original
EMB_MAX_CHARS = 15000
"A")


def clamp_text(s: str, max_chars: int = EMB_MAX_CHARS) -> str:
    if len(s) <= max_chars:
        return s
    # Prefer cutting at a whitespace boundary
    cutoff = s.rfind(" ", 0, max_chars)
    return s[: (cutoff if cutoff > 0 else max_chars)]


def split_by_words(s: str, words_per_chunk: int = 900) -> List[str]:
    """Approximate token-based chunking without external deps."""
    ws = s.split()
    return [" ".join(ws[i : i + words_per_chunk]) for i in range(0, len(ws), words_per_chunk)]


def vec_to_literal(v: Sequence[float]) -> str:
    # pgvector accepts '[v1,v2,...]' text literal
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"


def average_vectors(rows: Sequence[Sequence[float]]) -> List[float]:
    if not rows:
        return []
    dim = len(rows[0])
    acc = [0.0] * dim
    for r in rows:
        for i, x in enumerate(r):
            acc[i] += float(x)
    n = float(len(rows))
    return [x / n for x in acc]


# ----------------------
# BigQuery query stage
# ----------------------

def query_bigquery(
    client: bigquery.Client,
    date_from: str,
    date_to: str,
    cpc_regex: str,
) -> Iterator[PatentRecord]:
    print(f"Querying BigQuery from {date_from} to {date_to} with CPC regex {cpc_regex}", file=sys.stderr)
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("date_from", "STRING", date_from),
            bigquery.ScalarQueryParameter("date_to", "STRING", date_to),
            bigquery.ScalarQueryParameter("cpc_regex", "STRING", cpc_regex),
        ]
    )
    job = client.query(BQ_SQL_TEMPLATE, job_config=job_config)
    for row in job.result(page_size=BQ_PAGE_SIZE):
        yield _to_record(row)


# ----------------------
# Postgres upsert stage
# ----------------------

def upsert_batch(pool, records):
    print("Upserting batch of", len(records), "records", file=sys.stderr)
    CHUNK = 20  
    with pool.connection() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(records), CHUNK):
                chunk = records[i:i+CHUNK]
       

# ----------------------
# PatentsView client
# ----------------------

def _pv_request(url: str, payload: Mapping) -> Mapping:
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if PV_API_KEY:
        headers["x-api-key"] = PV_API_KEY
    req = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=PV_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        raise RuntimeError(f"PatentsView HTTP {e.code}: {e.reason}") from e
    except URLError as e:
        raise RuntimeError(f"PatentsView network error: {e.reason}") from e

def _first_text(arr: Optional[Sequence[Mapping]]) -> Optional[str]:
    if not arr:
        return None
    for item in arr:
        t = (item.get("text") or "").strip()
        if t:
            return t
    return None

def _pv_to_record(item: Mapping) -> PatentRecord:
    # Support both PV and BigQuery-like shapes
    pub_id = item.get("publication_number") or item.get("pub_id") or ""
    app_no = item.get("application_number_formatted") or item.get("application_number")
    prio = item.get("priority_date")
    fam = item.get("family_id")
    kind = item.get("kind_code")
    pub_date = item.get("publication_date") or item.get("pub_date")
    filing = item.get("filing_date")

    title = item.get("title") or _first_text(item.get("title_localized")) or item.get("patent_title")
    abstract = item.get("abstract") or _first_text(item.get("abstract_localized")) or item.get("patent_abstract")

    assignee_name = None
    ah = item.get("assignee_harmonized") or item.get("assignee") or []
    if isinstance(ah, list) and ah:
        nm = ah[0].get("name") if isinstance(ah[0], Mapping) else ah[0]
        assignee_name = nm

    inventor_names: List[str] = []
    inv = item.get("inventor_harmonized") or item.get("inventor") or []
    if isinstance(inv, list):
        for v in inv:
            nm = v.get("name") if isinstance(v, Mapping) else v
            if nm:
                inventor_names.append(nm)

    cpc_structs: List[Mapping[str, Optional[str]]] = []
    cpcs = item.get("cpc") or []
    if isinstance(cpcs, list):
        seen: set[str] = set()
        for c in cpcs:
            code = (c.get("code") if isinstance(c, Mapping) else None) or None
            if code:
                code = code.replace(" ", "")
                if code not in seen:
                    seen.add(code)
                    cpc_structs.append(_parse_cpc_code(code))

    return PatentRecord(
        pub_id=str(pub_id),
        application_number=app_no,
        priority_date=int(prio) if prio else None,
        family_id=str(fam) if fam else None,
        filing_date=int(filing) if filing else None,
        kind_code=kind,
        title=title,
        abstract=abstract,
        assignee_name=assignee_name,
        inventor_name=inventor_names,
        pub_date=int(pub_date) if pub_date else 0,
        cpc=cpc_structs,
        claims_text=None,
    )

def query_patentsview(date_from: str, date_to: str, cpc_regex: str) -> Iterator[PatentRecord]:
    # Server-side filters for date; client-side CPC regex filter to reduce complexity
    page = 1
    regex = re.compile(cpc_regex)
    while True:
        payload = {
            "q": {
                "_and": [
                    {"publication_date": {"_gte": date_from.replace('-', '')}},
                    {"publication_date": {"_lt": date_to.replace('-', '')}},
                ]
            },
            "fields": [
                "publication_number", "application_number_formatted", "priority_date", "family_id",
                "kind_code", "publication_date", "filing_date", "title_localized", "abstract_localized",
                "assignee_harmonized", "inventor_harmonized", "cpc.code"
            ],
            "sort": [{"publication_date": "asc"}, {"publication_number": "asc"}],
            "page": page,
            "per_page": PV_PAGE_SIZE,
        }
        resp = _pv_request(PV_PATENTS_ENDPOINT, payload)
        docs = resp.get("data") or resp.get("patents") or []
        if not docs:
            break
        for d in docs:
            rec = _pv_to_record(d)
            # CPC filter
            if rec.cpc and any(regex.match("".join([p or '' for p in [c.get('section'), c.get('class'), c.get('subclass'), c.get('group'), c.get('subgroup')]])) for c in rec.cpc):
                yield rec
        meta = resp.get("meta") or {}
        pages = meta.get("total_pages") or meta.get("pages") or None
        page += 1
        if pages and page > int(pages):
            break

def fetch_claims_text(pub_id: str, prefer_grant: bool = True) -> Optional[str]:
    endpoints = []
    if prefer_grant:
        endpoints = [PV_GCLAIM_ENDPOINT, PV_PGCLAIM_ENDPOINT]
    else:
        endpoints = [PV_PGCLAIM_ENDPOINT, PV_GCLAIM_ENDPOINT]
    for ep in endpoints:
        try:
            payload = {"q": {"publication_number": pub_id}, "fields": ["claim_text"]}
            resp = _pv_request(ep, payload)
            arr = resp.get("data") or resp.get("results") or []
            if not arr:
                continue
            # Pick first non-empty claim_text
            for it in arr:
                text = it.get("claim_text") or it.get("text") or None
                if text:
                    return text
        except Exception:
            continue
    return None

# ----------------------
# Postgres upsert stage
# ----------------------

def upsert_batch(pool, records):
    print("Upserting batch of", len(records), "records", file=sys.stderr)
    CHUNK = 20  
    with pool.connection() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(records), CHUNK):
                chunk = records[i:i+CHUNK]
                rows = [{
                    "pub_id": r.pub_id,
                    "application_number": r.application_number,
                    "priority_date": r.priority_date,
                    "family_id": r.family_id,
                    "filing_date": r.filing_date,
                    "kind_code": r.kind_code,
                    "pub_date": r.pub_date,
                    "title": r.title,
                    "abstract": r.abstract,
                    "assignee_name": r.assignee_name,
                    "inventor_name": json.dumps(list(r.inventor_name), ensure_ascii=False),
                    "cpc": json.dumps(list(r.cpc), ensure_ascii=False),
                    "claims_text": r.claims_text,
                } for r in chunk]

                try:
                    cur.executemany(UPSERT_SQL, rows)  
                    cur.executemany(INGEST_LOG_SQL, [{
                        "pub_id": rec.pub_id,
                        "stage": "inserted",
                        "content_hash": content_hash(rec),
                        "detail": json.dumps({"source": "bigquery"}, ensure_ascii=False),
                    } for rec in chunk])
                except Exception as e:
                    print(f"Error upserting chunk starting with pub_id {chunk[0].pub_id}: {e}", file=sys.stderr)
                    continue

        conn.commit()



def latest_watermark(conn_str: str) -> Optional[date]:
    sql = "SELECT max(pub_date) FROM patent;"
    with psycopg.connect(conn_str) as conn, conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone()
    int_wm = row[0] if row and row[0] is not None else None
    print(f"Latest watermark from Postgres: {int_wm}", file=sys.stderr)
    if int_wm is not None:
        str_wm = str(int_wm)
        dt_wm = datetime.strptime(str_wm, "%Y%m%d").date()
    
        return dt_wm

# --------------------------
# Embeddings stage (OpenAI)
# --------------------------

def get_openai_client() -> OpenAI:
    # OPENAI_API_KEY required; OPENAI_BASE_URL optional for self-hosted proxies
    base = os.getenv("OPENAI_BASE_URL")
    if base:
        return OpenAI(base_url=base)
    return OpenAI()


def select_existing_embeddings(pool: ConnectionPool[PgConn], pub_ids: Sequence[str], models: Sequence[str]) -> set[tuple[str, str]]:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(SELECT_EXISTING_EMB_SQL, {"pub_ids": list(pub_ids), "models": list(models)})
        rows = cur.fetchall()
    return {(r[0], r[1]) for r in rows}


def build_ta_input(r: PatentRecord) -> Optional[str]:
    parts = [p for p in [r.title or "", r.abstract or ""] if p]
    if not parts:
        return None
    return clamp_text("\n\n".join(parts))


def build_claims_inputs(r: PatentRecord) -> List[str]:
    if not r.claims_text:
        return []
    text = clamp_text(r.claims_text)
    return split_by_words(text, words_per_chunk=900)


def embed_texts(client: OpenAI, texts: Sequence[str], model: str) -> List[List[float]]:
    out: List[List[float]] = []
    for batch in chunked(texts, EMB_BATCH_SIZE):
        resp = client.embeddings.create(model=model, input=list(batch))
        out.extend([d.embedding for d in resp.data])
    return out


def upsert_embeddings(pool: ConnectionPool[PgConn], rows: Sequence[dict]) -> None:
    if not rows:
        return
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.executemany(UPSERT_EMBEDDINGS_SQL, rows)
            conn.commit()
    except Exception as e:
        print(f"Error upserting embeddings: {e}", file=sys.stderr)


def ensure_embeddings_for_batch(pool: ConnectionPool[PgConn], client: OpenAI, batch: Sequence[PatentRecord]) -> Tuple[int, int]:
    """Create embeddings for title+abstract and claims. Returns (upserts, total_targets)."""
    if not batch:
        return (0, 0)

    pub_ids = [r.pub_id for r in batch]
    target_models = [MODEL_TA, MODEL_CLAIMS]

    existing = select_existing_embeddings(pool, pub_ids, target_models)

    rows: List[dict] = []
    total_targets = 0

    # Title+Abstract embeddings
    ta_inputs: List[Tuple[str, str]] = []  # (pub_id, text)
    for r in batch:
        if (r.pub_id, MODEL_TA) in existing:
            continue
        text = build_ta_input(r)
        if text:
            ta_inputs.append((r.pub_id, text))
            total_targets += 1
    if ta_inputs:
        vectors = embed_texts(client, [t for _, t in ta_inputs], EMB_MODEL)
        for (pub_id, _), vec in zip(ta_inputs, vectors):
            rows.append({"pub_id": pub_id, "model": MODEL_TA, "dim": len(vec), "embedding": vec_to_literal(vec)})

    # Claims embeddings (average of chunk vectors to fit schema)
    claims_pub_chunks: List[Tuple[str, List[str]]] = []
    for r in batch:
        if (r.pub_id, MODEL_CLAIMS) in existing:
            continue
        chunks = build_claims_inputs(r)
        if chunks:
            claims_pub_chunks.append((r.pub_id, chunks))
            total_targets += 1
    if claims_pub_chunks:
        # Flatten for batching
        flat_texts: List[str] = []
        offsets: List[Tuple[int, int]] = []  # start, end
        start = 0
        for _, chunks in claims_pub_chunks:
            flat_texts.extend(chunks)
            end = start + len(chunks)
            offsets.append((start, end))
            start = end
        flat_vecs = embed_texts(client, flat_texts, EMB_MODEL)
        # Re-aggregate by pub
        for (pub_id, chunks), (s, e) in zip(claims_pub_chunks, offsets):
            vecs = flat_vecs[s:e]
            avg = average_vectors(vecs)
            if avg:
                rows.append({"pub_id": pub_id, "model": MODEL_CLAIMS, "dim": len(avg), "embedding": vec_to_literal(avg)})

    # Write
    upsert_embeddings(pool, rows)
    return (len(rows), total_targets)


# -----------
# CLI / main
# -----------



def update_claims(pool: ConnectionPool[PgConn], pub_id: str, claims_text: str) -> bool:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("""UPDATE patent SET claims_text=%s, updated_at=NOW() WHERE pub_id=%s""", (claims_text, pub_id))
        return cur.rowcount > 0


# Replace BigQuery query with PatentsView query

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--date-from", help="YYYY-MM-DD; default=max(pub_date) or last 10 days")
    p.add_argument("--date-to", help="YYYY-MM-DD (exclusive); default=max(pub_date) + 10 days or today")
    p.add_argument("--batch-size", type=int, default=800, help="DB upsert batch size")
    p.add_argument("--claims", action="store_true", help="Fetch and update claims_text via PatentsView")
    p.add_argument("--embed", action="store_true", default=True, help="Generate embeddings for title+abstract and claims")
    p.add_argument("--dsn", default=os.getenv("PG_DSN", ""), help="Postgres DSN")
    p.add_argument("--dry-run", action="store_true", help="Do not write to Postgres")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if not args.dsn:
        print("PG_DSN not set and --dsn not provided", file=sys.stderr)
        return 2

    cpc_regex = os.getenv("CPC_REGEX", AI_CPC_REGEX_DEFAULT)

    # Resolve watermark
    if args.date_from:
        date_from = args.date_from
    else:
        # default: last known pub_date + 10 days or 10 days ago
        # For simplicity here, default to 10 days ago
        date_from = (date.today() - timedelta(days=10)).isoformat()

    if args.date_to:
        date_to = args.date_to
    else:
        date_to = (date.fromisoformat(date_from) + timedelta(days=10)).isoformat()

    pool: ConnectionPool[PgConn] = ConnectionPool(
        conninfo=args.dsn,
        max_size=4,
        kwargs={"autocommit": False, "sslmode": "require"},
    )

    oa_client: Optional[OpenAI] = None
    if args.embed:
        oa_client = get_openai_client()

    # Stream from PatentsView
    stream = query_patentsview(date_from=date_from, date_to=date_to, cpc_regex=cpc_regex)

    total_rows = 0
    total_claims_updates = 0
    total_claims_requested = 0
    total_emb_upserts = 0
    total_emb_targets = 0

    for batch in chunked(stream, args.batch_size):
        if args.dry_run:
            total_rows += len(batch)
            continue

        upsert_batch(pool, batch)
        total_rows += len(batch)

        if args.claims:
            total_claims_requested += len(batch)
            updates = 0
            for r in batch:
                txt = fetch_claims_text(r.pub_id)
                if not txt:
                    continue
                updated = update_claims(pool, r.pub_id, txt)
                updates += 1 if updated else 0
            total_claims_updates += updates

        if args.embed and oa_client:
            # title+abstract
            ta_inputs = [(r.pub_id, build_ta_input(r)) for r in batch]
            ta_inputs = [(pid, s) for pid, s in ta_inputs if s]
            targets = len(ta_inputs)
            to_embed = [s for _, s in ta_inputs]
            vectors = embed_texts(oa_client, to_embed, EMB_MODEL)
            now = datetime.utcnow().isoformat()
            rows = [
                {"pub_id": pid, "model": EMB_MODEL, "dim": EMB_DIM_HINT, "vector": json.dumps(vec), "created_at": now}
                for (pid, _), vec in zip(ta_inputs, vectors)
            ]
            upsert_embeddings(pool, rows)
            total_emb_upserts += len(rows)
            total_emb_targets += targets

            # claims chunks
            claim_inputs: List[Tuple[str, str]] = []
            for r in batch:
                for chunk in build_claims_inputs(r):
                    claim_inputs.append((r.pub_id, chunk))
            if claim_inputs:
                vectors = embed_texts(oa_client, [s for _, s in claim_inputs], EMB_MODEL)
                now = datetime.utcnow().isoformat()
                rows = [
                    {"pub_id": pid, "model": EMB_MODEL, "dim": EMB_DIM_HINT, "vector": json.dumps(vec), "created_at": now}
                    for (pid, _), vec in zip(claim_inputs, vectors)
                ]
                upsert_embeddings(pool, rows)
                total_emb_upserts += len(rows)
                total_emb_targets += len(claim_inputs)

        print("Processed batch", file=sys.stderr)

    print(
        f"Upserted {total_rows} records from {date_from} to {date_to}"
        + (f"; claims {total_claims_updates}/{total_claims_requested}" if args.claims else "")
        + (f"; embeddings {total_emb_upserts}/{total_emb_targets}" if args.embed else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
