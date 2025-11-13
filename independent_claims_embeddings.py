from __future__ import annotations

import argparse
import os
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
import uuid

from dotenv import load_dotenv
from openai import OpenAI
from psycopg import Connection
from psycopg.rows import TupleRow
from psycopg_pool import ConnectionPool
from tenacity import retry, stop_after_attempt, wait_random_exponential

from infrastructure.logger import setup_logger

logger = setup_logger(__name__)

# -----------------------
# Configuration constants
# -----------------------
load_dotenv()

EMB_MODEL = "text-embedding-3-small"
EMB_BATCH_SIZE = int(os.getenv("EMB_BATCH_SIZE", "150"))
EMB_MAX_CHARS = int(os.getenv("EMB_MAX_CHARS", "25000"))

# psycopg generics
type PgConn = Connection[TupleRow]

# -------------
# SQL templates
# -------------

SELECT_CLAIMS_SQL = """
SELECT
    pc.id,
    pc.pub_id,
    pc.claim_number,
    pc.claim_text,
    pc.is_independent
FROM patent_claim pc
"""

SELECT_EXISTING_EMB_SQL = """
SELECT pub_id
FROM patent_claim_embeddings
WHERE pub_id = %(pub_id)s
AND claim_number = %(claim_number)s
"""

UPSERT_EMBEDDINGS_SQL = """
INSERT INTO patent_claim_embeddings (pub_id, claim_number,dim, created_at, embedding)
VALUES (%(pub_id)s, %(claim_number)s, %(dim)s, NOW(), CAST(%(embedding)s AS vector))
ON CONFLICT (pub_id, claim_number)
DO UPDATE SET dim = EXCLUDED.dim,
              embedding = EXCLUDED.embedding,
              created_at = NOW();
"""

# --------------
# Data structures
# --------------

@dataclass(frozen=True)
class PatentRecord:
    """Minimal patent record for embedding generation."""
    pub_id: str
    claim_number: int
    claim_text: str | None
    is_independent: bool | None


# -----------
# Utilities
# -----------


def clamp_text(s: str, max_chars: int = EMB_MAX_CHARS) -> str:
    """
    Truncate text to max_chars, preferring whitespace boundaries.

    Args:
        s: Input text.
        max_chars: Maximum character length.

    Returns:
        Truncated text string.
    """
    if len(s) <= max_chars:
        return s
    # Prefer cutting at a whitespace boundary
    cutoff = s.rfind(" ", 0, max_chars)
    return s[: (cutoff if cutoff > 0 else max_chars)]


def split_by_words(s: str, words_per_chunk: int = 2000) -> list[str]:
    """
    Split text into chunks by word count.

    Args:
        s: Input text.
        words_per_chunk: Maximum words per chunk.

    Returns:
        List of text chunks.
    """
    ws = s.split()
    return [" ".join(ws[i : i + words_per_chunk]) for i in range(0, len(ws), words_per_chunk)]


def vec_to_literal(v: Sequence[float]) -> str:
    """
    Convert vector to pgvector text literal format.

    Args:
        v: Vector as sequence of floats.

    Returns:
        String in pgvector '[v1,v2,...]' format.
    """
    return "[" + ",".join(f"{x:.8f}" for x in v) + "]"


def average_vectors(rows: Sequence[Sequence[float]]) -> list[float]:
    """
    Compute element-wise average of vectors.

    Args:
        rows: Sequence of vectors with same dimension.

    Returns:
        Averaged vector.
    """
    if not rows:
        return []
    dim = len(rows[0])
    acc = [0.0] * dim
    for r in rows:
        for i, x in enumerate(r):
            acc[i] += float(x)
    n = float(len(rows))
    return [x / n for x in acc]


def chunked(iterable, size: int):
    """
    Yield successive chunks from iterable.

    Args:
        iterable: Input iterable.
        size: Chunk size.

    Yields:
        Lists of up to size elements.
    """
    buf = []
    for item in iterable:
        buf.append(item)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


# ----------------------
# OpenAI client
# ----------------------


def get_openai_client() -> OpenAI:
    """
    Create OpenAI client from environment variables.

    Returns:
        Configured OpenAI client instance.
    """
    base = os.getenv("OPENAI_BASE_URL")
    if base:
        return OpenAI(base_url=base)
    return OpenAI()


@retry(wait=wait_random_exponential(min=1, max=60), stop=stop_after_attempt(6))
def embed_texts(client: OpenAI, texts: Sequence[str], model: str) -> list[list[float]]:
    """
    Generate embeddings for texts using OpenAI API with retry logic.

    Args:
        client: OpenAI client instance.
        texts: Sequence of text strings to embed.
        model: Embedding model name.

    Returns:
        List of embedding vectors.
    """
    out: list[list[float]] = []
    for batch in chunked(texts, EMB_BATCH_SIZE):
        resp = client.embeddings.create(model=model, input=list(batch))
        out.extend([d.embedding for d in resp.data])
        time.sleep(2)
    return out


# ----------------------
# Database operations
# ----------------------


def query_patents(
    pool: ConnectionPool[PgConn]) -> list[PatentRecord]:
    """
    Query patents with pub_date between date_from (inclusive) and date_to (exclusive).

    Args:
        pool: Database connection pool.
        date_from: Start date as YYYYMMDD integer.
        date_to: End date as YYYYMMDD integer (exclusive).

    Returns:
        List of PatentRecord instances.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(SELECT_CLAIMS_SQL)
        rows = cur.fetchall()

    records = []
    for row in rows:
        records.append(
            PatentRecord(
                pub_id=row[1],      # pub_id is the second column
                claim_number=row[2],  # claim_number is the third column
                claim_text=row[3],   # claim_text is the fourth column
                is_independent=row[4], # is_independent is the fifth column
            )
        )
    return records


def select_existing_embeddings(
    pool: ConnectionPool[PgConn], pub_ids_cn: Sequence[tuple[str, int]]
) -> set[tuple[str, int]]:
    """
    Query existing embeddings for given pub_ids and models.

    Args:
        pool: Database connection pool.
        pub_ids: Sequence of publication IDs.
        models: Sequence of model names.

    Returns:
        Set of (pub_id, model) tuples that already exist.
    """
    rows: list[tuple[str, int]] = []
    with pool.connection() as conn, conn.cursor() as cur:
        for (pub_id, claim_number) in pub_ids_cn:
            cur.execute(SELECT_EXISTING_EMB_SQL, {"pub_id": pub_id, "claim_number": claim_number})
            row = cur.fetchone()
            if row:
                rows.append((pub_id, claim_number))
    return {(r[0], r[1]) for r in rows}


def upsert_embeddings(pool: ConnectionPool[PgConn], rows: Sequence[dict]) -> None:
    """
    Upsert embedding records into patent_embeddings table.

    Args:
        pool: Database connection pool.
        rows: Sequence of dicts with keys: pub_id, model, dim, embedding.

    Raises:
        Exception: If database operation fails.
    """
    if not rows:
        return
    conn = None
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                for row in rows:
                    cur.execute(UPSERT_EMBEDDINGS_SQL, row)
            conn.commit()
    except Exception as e:
        logger.error(f"Error upserting embeddings: {e}")
        if conn is not None:
            conn.rollback()
        raise


# ----------------------
# Embedding generation
# ----------------------


def build_claims_inputs(r: PatentRecord) -> list[str]:
    """
    Build claims input chunks for embedding.

    Args:
        r: PatentRecord instance.

    Returns:
        List of text chunks from claims, or empty list if no claims.
    """
    if not r.claim_text:
        return []
    text = clamp_text(r.claim_text)
    return split_by_words(text, words_per_chunk=2000)


def ensure_embeddings_for_batch(
    pool: ConnectionPool[PgConn], client: OpenAI, batch: Sequence[PatentRecord]
) -> tuple[int, int]:
    """
    Generate and upsert missing embeddings for a batch of patents.

    Args:
        pool: Database connection pool.
        client: OpenAI client instance.
        batch: Sequence of PatentRecord instances.

    Returns:
        Tuple of (embeddings_upserted, total_targets).
    """
    if not batch:
        return (0, 0)

    pub_ids_cn = [(r.pub_id, r.claim_number) for r in batch]

    existing = select_existing_embeddings(pool, pub_ids_cn)

    rows: list[dict] = []
    total_targets = 0

    # Claims embeddings (average of chunk vectors to fit schema)
    claims_pub_chunks: list[tuple[str, list[str]]] = []
    for r in batch:
        if (r.pub_id, r.claim_number) in existing:
            continue
        chunks = build_claims_inputs(r)
        if chunks:
            claims_pub_chunks.append((f"{r.pub_id}+{r.claim_number}", chunks))
            total_targets += 1
        else:
            logger.error(f"Skipping claims embedding for {r.pub_id}: no claims text available")

    if claims_pub_chunks:
        logger.info(f"Generating {len(claims_pub_chunks)} claims embeddings")
        # Flatten for batching
        flat_texts: list[str] = []
        offsets: list[tuple[int, int]] = []  # start, end
        start = 0
        for _, chunks in claims_pub_chunks:
            flat_texts.extend(chunks)
            end = start + len(chunks)
            offsets.append((start, end))
            start = end
        flat_vecs = embed_texts(client, flat_texts, EMB_MODEL)
        # Re-aggregate by pub
        for (pub_id_cn, _chunks), (s, e) in zip(claims_pub_chunks, offsets, strict=True):
            pub_id, claim_number = pub_id_cn.split("+")
            vecs = flat_vecs[s:e]
            avg = average_vectors(vecs)
            if avg:
                rows.append(
                    {
                        "pub_id": pub_id,
                        "claim_number": claim_number,
                        "dim": len(avg),
                        "embedding": vec_to_literal(avg),
                    }
                )

    # Write
    if rows:
        logger.info(f"Upserting {len(rows)} embeddings")
        upsert_embeddings(pool, rows)

    return (len(rows), total_targets)


# -----------
# CLI / main
# -----------


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments.

    Returns:
        Parsed arguments namespace.
    """
    p = argparse.ArgumentParser(
        description="Backfill missing embeddings for patents within a date range."
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Batch size for processing patents (default: 500)",
    )
    p.add_argument(
        "--dsn",
        default=os.getenv("PG_DSN", ""),
        help="Postgres DSN (default: from PG_DSN environment variable)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Query patents but do not generate or upsert embeddings",
    )
    return p.parse_args()


def main() -> int:
    """
    Main entry point for the script.

    Returns:
        Exit code (0 for success, non-zero for error).
    """
    args = parse_args()

    if not args.dsn:
        logger.error("PG_DSN not set and --dsn not provided")
        return 2


    # Setup database pool
    pool = ConnectionPool[PgConn](
        conninfo=args.dsn,
        max_size=10,
        kwargs={
            "autocommit": False,
            "sslmode": "require",
            "prepare_threshold": None,
            "channel_binding": "require",
        },
    )

    # Query patents
    logger.info("Querying patents")
    patent_claims = query_patents(pool)
    logger.info(f"Found {len(patent_claims)} patents")

    if not patent_claims:
        logger.info("No patents found, exiting")
        return 0

    if args.dry_run:
        logger.info("Dry run mode: skipping embedding generation")
        # Still check what's missing
        pub_ids_cn = [(r.pub_id, r.claim_number) for r in patent_claims]
        existing = select_existing_embeddings(pool, pub_ids_cn)
        missing_count = 0
        for r in patent_claims:
            if (r.pub_id, r.claim_number) not in existing and build_claims_inputs(r):
                missing_count += 1
        logger.info(f"Would generate {missing_count} missing embeddings")
        return 0

    # Setup OpenAI client
    oa_client = get_openai_client()

    # Process in batches
    total_upserted = 0
    total_targets = 0

    for i, batch in enumerate(chunked(patent_claims, args.batch_size)):
        logger.info(f"Processing batch {i + 1} ({len(batch)} patents)")
        upserted, targets = ensure_embeddings_for_batch(pool, oa_client, batch)
        total_upserted += upserted
        total_targets += targets

    logger.info(
        f"Completed: upserted {total_upserted} embeddings out of {total_targets} targets"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
