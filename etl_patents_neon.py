#!/usr/bin/env python3
"""
etl_patents_neon.py  —  FINAL

Purpose
- Create/upgrade schema (pgvector + fulltext + CPC jsonb + ETL watermark)
- Load patents from CSV (BigQuery export) or built-in sample
- Generate embeddings (OpenAI or deterministic hash fallback) IN BATCHES
- Upsert metadata + vectors
- Resume-safe: skips already embedded IDs
- Incremental: updates watermark (yyyymmdd int) if CSV provides pub_int

CSV expected headers:
  id,title,abstract,assignee,pub_date,cpc_codes[,pub_int]
  - cpc_codes: semicolon-delimited, e.g. "G06F/16;G06N/20"
  - pub_int: optional INT yyyymmdd for incremental ETL watermark

Env:
  DATABASE_URL="postgresql://USER:PASS@HOST/DB?sslmode=require"
  OPENAI_API_KEY="..."   # optional for real embeddings

Install:
  pip install psycopg2-binary numpy tqdm python-dotenv
  # optional for real embeddings:
  pip install openai==1.*
"""

import os
import csv
import sys
import json
import hashlib
import argparse
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

import numpy as np
import psycopg2
import psycopg2.extras
from tqdm import tqdm

# -------------------- Config --------------------
EMBED_DIM = 1536
DB_BATCH = 64
EMB_BATCH = 64  # <=64 keeps you well under 300k token limit per request

# -------------------- .env ----------------------
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# -------------------- Sample rows ---------------
SAMPLE_ROWS = [
    ("US-20240123456-A1", "Systems for efficient LLM inference",
     "Techniques for caching attention states across transformer decoding steps.", "Phaethon Order LLC", "2024-04-18", "G06F/16;G06N/20", 20240418),
    ("US-20240123457-A1", "Energy-aware edge AI",
     "Dynamic quantization and scheduling for edge devices performing neural inference.", "EdgeCompute Inc.", "2024-05-02", "G06F/1", 20240502),
    ("US-20240123458-A1", "Secure federated training",
     "Homomorphic encryption with sparse updates for privacy-preserving model training.", "SecureAI Corp.", "2024-06-06", "G06F/21", 20240606),
]

# -------------------- Embeddings ----------------
def _normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / (n + 1e-12)

def embed_hash(texts: List[str], dim: int = EMBED_DIM) -> List[List[float]]:
    out = []
    for t in texts:
        seed = hashlib.sha256(t.encode("utf-8")).digest()
        rng = np.random.default_rng(int.from_bytes(seed[:8], "big", signed=False))
        v = rng.standard_normal(dim).astype(np.float32)
        out.append(_normalize(v).tolist())
    return out

def embed_openai_batched(texts: List[str], dim: int = EMBED_DIM, batch_size: int = EMB_BATCH) -> List[List[float]]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return embed_hash(texts, dim)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        results: List[List[float]] = []
        for i in range(0, len(texts), batch_size):
            chunk = texts[i:i+batch_size]
            resp = client.embeddings.create(model="text-embedding-3-small", input=chunk)
            for e in resp.data:
                results.append(e.embedding)
        arr = np.array(results, dtype=np.float32)
        if arr.shape[1] != dim:  # pad or truncate defensively
            if arr.shape[1] > dim:
                arr = arr[:, :dim]
            else:
                pad = np.zeros((arr.shape[0], dim - arr.shape[1]), dtype=np.float32)
                arr = np.hstack([arr, pad])
        arr = np.vstack([_normalize(v) for v in arr])
        return arr.tolist()
    except Exception as e:
        print(f"[warn] OpenAI embedding failed, fallback to hash: {e}", file=sys.stderr)
        return embed_hash(texts, dim)

# -------------------- DB DDL --------------------
DDL = f"""
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS patent (
  id        TEXT PRIMARY KEY,
  pub_date  DATE,
  title     TEXT,
  abstract  TEXT,
  assignee  TEXT,
  cpc       JSONB
);

-- Full-text index (title + abstract)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patent_fulltext'
  ) THEN
    CREATE INDEX idx_patent_fulltext ON patent
    USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')));
  END IF;
END $$;

-- CPC jsonb path ops index
CREATE INDEX IF NOT EXISTS idx_patent_cpc_gin ON patent USING GIN (cpc jsonb_path_ops);

CREATE TABLE IF NOT EXISTS patent_embeddings (
  patent_id TEXT PRIMARY KEY REFERENCES patent(id) ON DELETE CASCADE,
  embedding VECTOR({EMBED_DIM})
);

-- IVF index after initial load
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patent_embeddings_ivf'
  ) THEN
    CREATE INDEX idx_patent_embeddings_ivf
    ON patent_embeddings USING ivfflat (embedding vector_l2_ops) WITH (lists = 50);
  END IF;
END $$;

-- Incremental ETL watermark
CREATE TABLE IF NOT EXISTS etl_state (
  key TEXT PRIMARY KEY,
  last_pub_int BIGINT,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO etl_state(key, last_pub_int)
VALUES ('publications', 0)
ON CONFLICT (key) DO NOTHING;
"""

UPSERT_PATENT = """
INSERT INTO patent (id, pub_date, title, abstract, assignee, cpc)
VALUES (%(id)s, %(pub_date)s, %(title)s, %(abstract)s, %(assignee)s, %(cpc)s::jsonb)
ON CONFLICT (id) DO UPDATE
SET pub_date = EXCLUDED.pub_date,
    title    = EXCLUDED.title,
    abstract = EXCLUDED.abstract,
    assignee = EXCLUDED.assignee,
    cpc      = EXCLUDED.cpc;
"""

UPSERT_EMB = """
INSERT INTO patent_embeddings (patent_id, embedding)
VALUES (%(patent_id)s, %(embedding)s)
ON CONFLICT (patent_id) DO UPDATE
SET embedding = EXCLUDED.embedding;
"""

UPDATE_WATERMARK = """
UPDATE etl_state
   SET last_pub_int = GREATEST(COALESCE(last_pub_int,0), %s),
       updated_at = now()
 WHERE key = 'publications';
"""

# -------------------- Types / IO ----------------
@dataclass
class PatentRow:
    id: str
    title: str
    abstract: str
    assignee: str
    pub_date: Optional[str]
    cpc_codes: Optional[str] = None  # "G06F/16;G06N/20"
    pub_int: Optional[int] = None    # 20240131 as INT

def parse_cpc_codes(s: Optional[str]) -> Optional[List[str]]:
    if not s:
        return None
    codes = list({c.strip() for c in s.split(';') if c.strip()})
    return codes or None

def read_csv(path: str, limit: Optional[int]) -> List[PatentRow]:
    rows: List[PatentRow] = []
    with open(path, newline='', encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            pub_int_raw = row.get("pub_int")
            pub_int = None
            try:
                if pub_int_raw and pub_int_raw.strip().isdigit():
                    pub_int = int(pub_int_raw)
            except Exception:
                pub_int = None
            rows.append(PatentRow(
                id=row["id"].strip(),
                title=row.get("title", "").strip(),
                abstract=row.get("abstract", "").strip(),
                assignee=row.get("assignee", "").strip(),
                pub_date=row.get("pub_date", "").strip() or None,
                cpc_codes=row.get("cpc_codes", None),
                pub_int=pub_int
            ))
            if limit and len(rows) >= limit:
                break
    return rows

def sample_rows(limit: Optional[int]) -> List[PatentRow]:
    data = SAMPLE_ROWS[:limit] if limit else SAMPLE_ROWS
    return [PatentRow(*r) for r in data]

def connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL env var required", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(url)

def ensure_schema(conn):
    with conn, conn.cursor() as cur:
        cur.execute(DDL)

def chunked(iterable: Iterable, size: int) -> Iterable[List]:
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch

def upsert_patents(conn, items: List[PatentRow]):
    dicts = []
    for x in items:
        dicts.append(dict(
            id=x.id,
            pub_date=x.pub_date,
            title=x.title,
            abstract=x.abstract,
            assignee=x.assignee,
            cpc=json.dumps(parse_cpc_codes(x.cpc_codes))
        ))
    with conn, conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, UPSERT_PATENT, dicts, page_size=DB_BATCH)

def upsert_embeddings(conn, pairs: List[Tuple[str, List[float]]]):
    recs = [dict(patent_id=k, embedding=np.array(v, dtype=np.float32)) for k, v in pairs]
    with conn, conn.cursor() as cur:
        # Format numpy array to pgvector text input '[x1,...]'
        def adapt_vector(arr: np.ndarray):
            return psycopg2.extensions.AsIs("'" + "[" + ",".join(f"{x:.6f}" for x in arr.tolist()) + "]" + "'")
        psycopg2.extensions.register_adapter(np.ndarray, adapt_vector)
        psycopg2.extras.execute_batch(cur, UPSERT_EMB, recs, page_size=DB_BATCH)

def fetch_existing_embedding_ids(conn) -> set:
    with conn, conn.cursor() as cur:
        cur.execute("SELECT patent_id FROM patent_embeddings")
        return {r[0] for r in cur.fetchall()}

def update_watermark(conn, rows: List[PatentRow]):
    max_pub_int = 0
    for r in rows:
        if r.pub_int and r.pub_int > max_pub_int:
            max_pub_int = r.pub_int
    if max_pub_int > 0:
        with conn, conn.cursor() as cur:
            cur.execute(UPDATE_WATERMARK, (max_pub_int,))

# -------------------- Main ----------------------
def main():
    ap = argparse.ArgumentParser(description="Patent Scout ETL -> Neon/Supabase Postgres")
    ap.add_argument("--csv", help="Path to CSV with headers: id,title,abstract,assignee,pub_date,cpc_codes[,pub_int]")
    ap.add_argument("--limit", type=int, default=0, help="Max rows to load (0 = all)")
    ap.add_argument("--provider", choices=["auto","openai","hash"], default="auto",
                    help="Embedding provider: auto=OpenAI if available else hash")
    ap.add_argument("--no-resume", action="store_true",
                    help="Disable resume-safety; re-embed everything in the CSV")
    args = ap.parse_args()

    # Load input
    if args.csv:
        rows = read_csv(args.csv, args.limit or None)
        if not rows:
            print("No rows read from CSV.", file=sys.stderr)
            return
    else:
        rows = sample_rows(args.limit or None)

    # Connect + ensure schema
    conn = connect()
    ensure_schema(conn)

    # Resume-safety: drop rows that already have embeddings
    if not args.no_resume:
        done = fetch_existing_embedding_ids(conn)
        before = len(rows)
        rows = [r for r in rows if r.id not in done]
        skipped = before - len(rows)
        if skipped > 0:
            print(f"Resume-safe: skipping {skipped} rows already embedded.")

    if not rows:
        print("No new rows to process.")
        conn.close()
        return

    # Upsert metadata first
    print(f"Upserting {len(rows)} patents…")
    for batch in tqdm(list(chunked(rows, DB_BATCH))):
        upsert_patents(conn, batch)

    # Prepare embedding inputs
    texts = [f"{r.title} || {r.abstract}" for r in rows]

    # Embed in batches
    print("Generating embeddings…")
    if args.provider == "openai":
        vecs = embed_openai_batched(texts, EMBED_DIM, EMB_BATCH)
    elif args.provider == "hash":
        vecs = embed_hash(texts, EMBED_DIM)
    else:
        vecs = embed_openai_batched(texts, EMBED_DIM, EMB_BATCH)

    # Upsert vectors
    print("Upserting embeddings…")
    pairs = [(r.id, v) for r, v in zip(rows, vecs)]
    for batch in tqdm(list(chunked(pairs, DB_BATCH))):
        upsert_embeddings(conn, batch)

    # Analyze tables
    with conn, conn.cursor() as cur:
        cur.execute("ANALYZE patent;")
        cur.execute("ANALYZE patent_embeddings;")

    # Update watermark if pub_int present
    update_watermark(conn, rows)

    # Smoke tests
    with conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, pub_date
            FROM patent
            WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')) @@ plainto_tsquery('english', %s)
            ORDER BY pub_date DESC
            LIMIT 5;
        """, ("inference",))
        print("Keyword sample:", cur.fetchall())

        # Vector sample uses hash to avoid network during smoke test
        qvec = embed_hash(["LLM inference caching"], EMBED_DIM)[0]
        cur.execute("""
            SELECT p.id, p.title
            FROM patent_embeddings e
            JOIN patent p ON p.id = e.patent_id
            ORDER BY e.embedding <-> %s
            LIMIT 5;
        """, (np.array(qvec, dtype=np.float32),))
        print("Vector sample:", cur.fetchall())

        # CPC sample (if present)
        cur.execute("""
            SELECT id, title, pub_date
            FROM patent
            WHERE cpc ? 'G06F/16'
            ORDER BY pub_date DESC
            LIMIT 5;
        """)
        print("CPC sample:", cur.fetchall())

    if args.csv is None and args.limit == 0:
        with conn, conn.cursor() as cur:
            cur.execute("""
                SELECT COALESCE(last_pub_int,0) FROM etl_state WHERE key='publications';
            """)
            row = cur.fetchone()
            wm = row[0] if row is not None else 0
            print(f"Current watermark sample: last_pub_int = {wm}")
    conn.close()
    print("Done.")

if __name__ == "__main__":
    main()
