#!/usr/bin/env python3
"""
add_canon_name.py

Generate canonical assignee names from patent table assignee_name field.

This script:
1. Reads all unique assignee_name values from the patent table
2. Generates canonical_assignee_name by:
   - Removing company suffixes (inc, llc, corp, etc.)
   - Removing all punctuation
   - Removing leading and trailing spaces
3. Inserts unique canonical names into the canonical_assignee_name table
4. Creates assignee_alias records linking original names to canonical names

Usage:
    python add_canon_name.py --dsn "postgresql://user:pass@host/db"
    python add_canon_name.py  # Uses PG_DSN environment variable
"""

from __future__ import annotations

import argparse
import contextlib
import logging
import os
import re
import string

import psycopg
from dotenv import load_dotenv
from psycopg import Connection
from psycopg.rows import TupleRow
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from infrastructure.logger import setup_logger

logger = setup_logger()

# Type alias for PostgreSQL connection
type PgConn = Connection[TupleRow]

# Company suffixes to remove from the end of assignee names
COMPANY_SUFFIXES = [
    "incorporated",
    "corporation",
    "limited",
    "inc",
    "llc",
    "corp",
    "ltd",
    "gmbh",
    "ass",
    "pty",
    "mfg",
    "sys",
    "man",
    "l y",
    "l p",
    "oy",
    "nv",
    "sas",
    "co",
    "bv",
    "ag",
    "inst",
    "b v",
    "int",
    "ind",
    "kk",
    "lp",
    "se",
    "ab",
]


def canonicalize_assignee_name(assignee_name: str) -> str:
    """
    Generate a canonical assignee name by:
    1. Converting to lowercase
    2. Removing company suffixes from the end
    3. Removing all punctuation
    4. Removing leading and trailing spaces

    Args:
        assignee_name: Original assignee name

    Returns:
        Canonical assignee name
    """
    if not assignee_name:
        return ""

    # Convert to lowercase for case-insensitive matching
    canonical = assignee_name.lower().strip()

    # Remove company suffixes from the end
    # Sort suffixes by length (longest first) to handle multi-word suffixes correctly
    sorted_suffixes = sorted(COMPANY_SUFFIXES, key=len, reverse=True)

    for suffix in sorted_suffixes:
        # Create pattern to match suffix at the end, possibly preceded by punctuation/space
        # This handles cases like "Company, Inc." or "Company Inc"
        pattern = rf'\s*[{re.escape(string.punctuation)}]*\s*{re.escape(suffix)}\s*$'
        canonical = re.sub(pattern, '', canonical, flags=re.IGNORECASE)

    # Remove all punctuation
    canonical = canonical.translate(str.maketrans('', '', string.punctuation))

    # Remove leading and trailing spaces (and collapse multiple spaces)
    canonical = ' '.join(canonical.split())

    return canonical


@retry(
    retry=retry_if_exception_type((psycopg.OperationalError, psycopg.InterfaceError)),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.INFO),
)
def ensure_tables_exist(conn: psycopg.Connection) -> None:
    """
    Create canonical_assignee_name and assignee_alias tables if they don't exist.

    Args:
        conn: PostgreSQL connection
    """
    logger.info("Ensuring canonical_assignee_name and assignee_alias tables exist")

    with conn.cursor() as cur:
        # Create canonical_assignee_name table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS canonical_assignee_name (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                canonical_assignee_name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create assignee_alias table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS assignee_alias (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                canonical_id UUID NOT NULL REFERENCES canonical_assignee_name(id),
                assignee_name_alias TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create index on canonical_id for faster lookups
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_assignee_alias_canonical_id
            ON assignee_alias(canonical_id)
        """)
        conn.commit()

    logger.info("Tables created/verified successfully")


@retry(
    retry=retry_if_exception_type((psycopg.OperationalError, psycopg.InterfaceError)),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.INFO),
)
def get_unique_assignee_names(conn: psycopg.Connection) -> list[str]:
    """
    Fetch all unique assignee_name values from the patent table.

    Args:
        conn: PostgreSQL connection

    Returns:
        List of unique assignee names
    """
    logger.info("Fetching unique assignee names from patent table")

    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT assignee_name
            FROM patent
            WHERE assignee_name IS NOT NULL
              AND assignee_name != ''
            ORDER BY assignee_name
        """)
        rows = cur.fetchall()

    assignee_names = [row[0] for row in rows]
    logger.info(f"Found {len(assignee_names)} unique assignee names")

    return assignee_names


def safe_rollback(conn: psycopg.Connection) -> None:
    """
    Safely rollback a connection, handling connection loss gracefully.

    Args:
        conn: PostgreSQL connection
    """
    try:
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.rollback()
    except (psycopg.OperationalError, AttributeError) as e:
        logger.warning(f"Could not rollback transaction (connection may be lost): {e}")


@retry(
    retry=retry_if_exception_type((psycopg.OperationalError, psycopg.InterfaceError)),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.INFO),
)
def get_or_create_canonical_id(
    conn: psycopg.Connection,
    canonical_name: str,
    canonical_cache: dict[str, int]
) -> int:
    """
    Get or create a canonical_assignee_name record and return its ID.

    Args:
        conn: PostgreSQL connection
        canonical_assignee_name: Canonical assignee name
        canonical_cache: Cache of canonical_assignee_name -> id mappings

    Returns:
        ID of the canonical_assignee_name record
    """
    # Check cache first
    if canonical_name in canonical_cache:
        return canonical_cache[canonical_name]

    with conn.cursor() as cur:
        # Try to insert, on conflict do nothing and return existing id
        cur.execute("""
            INSERT INTO canonical_assignee_name (canonical_assignee_name)
            VALUES (%s)
            ON CONFLICT (canonical_assignee_name) DO NOTHING
            RETURNING id
        """, (canonical_name,))

        result = cur.fetchone()

        if result:
            canonical_id = result[0]
            logger.debug(f"Created new canonical name: {canonical_name} (id={canonical_id})")
        else:
            # Record already exists, fetch its id
            cur.execute("""
                SELECT id FROM canonical_assignee_name WHERE canonical_assignee_name = %s
            """, (canonical_name,))
            result = cur.fetchone()
            canonical_id = result[0] if result else None

            if canonical_id is None:
                raise RuntimeError(f"Failed to get or create canonical name: {canonical_name}")

            logger.debug(f"Found existing canonical name: {canonical_name} (id={canonical_id})")

    # Cache the result
    canonical_cache[canonical_name] = canonical_id

    return canonical_id


@retry(
    retry=retry_if_exception_type((psycopg.OperationalError, psycopg.InterfaceError)),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.INFO),
)
def check_alias_exists(conn: psycopg.Connection, assignee_name: str) -> bool:
    """
    Check if an assignee_name_alias already exists in the assignee_alias table.

    Args:
        conn: PostgreSQL connection
        assignee_name: Assignee name to check

    Returns:
        True if alias exists, False otherwise
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 1 FROM assignee_alias
            WHERE assignee_name_alias = %s
            LIMIT 1
        """, (assignee_name,))
        result = cur.fetchone()

    return result is not None


@retry(
    retry=retry_if_exception_type((psycopg.OperationalError, psycopg.InterfaceError)),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.INFO),
)
def create_alias(
    conn: psycopg.Connection,
    canonical_id: int,
    assignee_name: str
) -> None:
    """
    Create an assignee_alias record.

    Args:
        conn: PostgreSQL connection
        canonical_id: ID of the canonical assignee name
        assignee_name: Original assignee name (alias)
    """
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO assignee_alias (canonical_id, assignee_name_alias)
            VALUES (%s, %s)
            ON CONFLICT (canonical_id, assignee_name_alias) DO NOTHING
        """, (canonical_id, assignee_name))


def process_assignee_names(
    dsn: str,
    assignee_names: list[str],
    batch_size: int = 100
) -> tuple[int, int]:
    """
    Process all assignee names and create canonical names and aliases.
    Manages its own connection to handle reconnection on connection loss.

    Args:
        dsn: PostgreSQL connection string
        assignee_names: List of assignee names to process
        batch_size: Number of records to commit at once

    Returns:
        Tuple of (canonical_count, alias_count)
    """
    logger.info(f"Processing {len(assignee_names)} assignee names")

    canonical_cache: dict[str, int] = {}
    canonical_count = 0
    alias_count = 0

    # Create initial connection
    conn = psycopg.connect(dsn)

    for idx, assignee_name in enumerate(assignee_names):
        max_retries = 3
        retry_count = 0

        while retry_count < max_retries:
            try:
                # Generate canonical name
                canonical_name = canonicalize_assignee_name(assignee_name)

                if not canonical_name:
                    logger.warning(f"Skipping empty canonical name for: {assignee_name}")
                    break

                # Get or create canonical_assignee_name record
                canonical_id = get_or_create_canonical_id(conn, canonical_name, canonical_cache)

                # Track if this is a new canonical name
                if canonical_id not in [v for v in canonical_cache.values() if v != canonical_id]:
                    canonical_count += 1

                # Check if alias already exists
                if not check_alias_exists(conn, assignee_name):
                    create_alias(conn, canonical_id, assignee_name)
                    alias_count += 1
                    logger.debug(f"Created alias: {assignee_name} -> {canonical_name}")
                else:
                    logger.debug(f"Alias already exists: {assignee_name}")

                # Commit after each record to avoid idle-in-transaction timeout
                conn.commit()

                # Log progress in batches
                if (idx + 1) % batch_size == 0:
                    logger.info(f"Processed {idx + 1}/{len(assignee_names)} assignee names")

                # Successfully processed, break retry loop
                break

            except (psycopg.OperationalError, psycopg.InterfaceError) as e:
                retry_count += 1
                logger.warning(
                    f"Connection error processing '{assignee_name}' (attempt {retry_count}/{max_retries}): {e}"
                )

                # Safe rollback
                safe_rollback(conn)
                if retry_count < max_retries:
                    # Try to reconnect
                    with contextlib.suppress(Exception):
                        conn.close()

                    logger.info("Attempting to reconnect to database...")
                    logger.info("Attempting to reconnect to database...")
                    conn = psycopg.connect(dsn)
                    logger.info("Successfully reconnected to database")
                else:
                    logger.error(f"Failed to process '{assignee_name}' after {max_retries} attempts")
                    break

            except Exception as e:
                logger.error(f"Error processing assignee name '{assignee_name}': {e}", exc_info=True)
                safe_rollback(conn)
                break

    # Close connection
    # Close connection
    with contextlib.suppress(Exception):
        conn.close()
    logger.info(f"Processing complete. Created {canonical_count} canonical names and {alias_count} aliases")

    return canonical_count, alias_count


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate canonical assignee names from patent table"
    )
    parser.add_argument(
        "--dsn",
        default=os.getenv("PG_DSN", ""),
        help="PostgreSQL connection string (default: PG_DSN environment variable)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of records to commit at once (default: 100)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print canonical names without writing to database"
    )

    return parser.parse_args()


def main() -> int:
    """Main entry point."""
    load_dotenv()
    args = parse_args()

    if not args.dsn:
        logger.error("PostgreSQL DSN not provided. Set via --dsn or PG_DSN environment variable")
        return 1

    logger.info("Starting canonical assignee name generation")
    logger.info(f"Database: {args.dsn.split('@')[-1] if '@' in args.dsn else 'configured'}")

    try:
        with psycopg.connect(args.dsn) as conn:
            # Ensure tables exist
            if not args.dry_run:
                ensure_tables_exist(conn)

            # Get unique assignee names
            assignee_names = get_unique_assignee_names(conn)

        if args.dry_run:
            logger.info("Dry run mode: displaying sample canonical names")
            print("\nSample canonical names:")
            print("-" * 80)
            for assignee_name in assignee_names[:20]:
                canonical = canonicalize_assignee_name(assignee_name)
                print(f"{assignee_name:50} -> {canonical}")
            print("-" * 80)
            print(f"\nTotal assignee names to process: {len(assignee_names)}")
            return 0

        # Process all assignee names (manages its own connection for reconnection support)
        canonical_count, alias_count = process_assignee_names(
            args.dsn,
            assignee_names,
            batch_size=args.batch_size
        )

        logger.info(
            f"Successfully created {canonical_count} canonical names "
            f"and {alias_count} aliases"
        )
        print("\nResults:")
        print(f"  Canonical names created: {canonical_count}")
        print(f"  Aliases created: {alias_count}")
        print(f"  Total assignee names processed: {len(assignee_names)}")

        return 0

    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
