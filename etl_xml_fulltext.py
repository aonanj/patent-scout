#!/usr/bin/env python3
"""
etl_xml_fulltext.py

USPTO Patent Application Full Text XML → Postgres loader for Patent Scout.

Parses USPTO bulk XML files (e.g., ipa250220.xml) containing full text of patent
applications and upserts abstracts and claims into the patent_staging table.

Each XML file contains multiple <us-patent-application> records. This script:
1. Constructs pub_id from country-doc_number-kind
2. Extracts plain text from <abstract> tag
3. Extracts plain text from <claim-text> tags (excluding <us-claim-statement>)
4. Upserts abstract and claims_text to existing patent_staging records
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import psycopg
from dotenv import load_dotenv
from psycopg import Connection
from psycopg.rows import TupleRow

from infrastructure.logger import setup_logger

logger = setup_logger(__name__)

# -----------------------
# Configuration constants
# -----------------------
load_dotenv()

# psycopg generics
type PgConn = Connection[TupleRow]

# -------------
# SQL templates
# -------------

UPDATE_STAGING_SQL = """
UPDATE patent_staging
SET
    abstract = COALESCE(%(abstract)s, abstract),
    claims_text = COALESCE(%(claims_text)s, claims_text),
    updated_at = NOW()
WHERE pub_id = %(pub_id)s
RETURNING pub_id;
"""

CHECK_RECORD_EXISTS_SQL = """
SELECT pub_id FROM patent_staging WHERE pub_id = %(pub_id)s;
"""


# -----------------------
# Connection Management
# -----------------------

def create_connection(dsn: str, max_retries: int = 3, retry_delay: float = 1.0) -> PgConn:
    """Create a new database connection with retry logic.

    Args:
        dsn: PostgreSQL DSN string.
        max_retries: Maximum number of connection attempts.
        retry_delay: Delay between retries in seconds.

    Returns:
        Database connection.

    Raises:
        psycopg.OperationalError: If connection fails after all retries.
    """
    for attempt in range(max_retries):
        try:
            conn = psycopg.connect(
                dsn,
                autocommit=False,
                sslmode="require",
            )
            logger.info("Database connection established")
            return conn
        except psycopg.OperationalError as e:
            if attempt < max_retries - 1:
                logger.warning(f"Connection attempt {attempt + 1} failed: {e}. Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Failed to connect after {max_retries} attempts")
                raise


def is_connection_alive(conn: PgConn) -> bool:
    """Check if database connection is still alive.

    Args:
        conn: Database connection to check.

    Returns:
        True if connection is alive, False otherwise.
    """
    try:
        # Try to get the connection status
        if conn.closed:
            return False
        # Execute a simple query to verify connection
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except (psycopg.OperationalError, psycopg.InterfaceError):
        return False


def safe_rollback(conn: PgConn) -> None:
    """Safely rollback a connection, handling connection loss.

    Args:
        conn: Database connection to rollback.
    """
    try:
        if not conn.closed:
            conn.rollback()
            logger.debug("Transaction rolled back")
    except (psycopg.OperationalError, psycopg.InterfaceError) as e:
        logger.warning(f"Rollback failed (connection likely lost): {e}")


# --------------
# Data structures
# --------------

@dataclass
class PatentFullText:
    """Patent full text extracted from USPTO XML."""

    pub_id: str
    abstract: str | None
    claims_text: str | None


# -----------
# XML Parsing
# -----------

def extract_text_recursive(element: ET.Element, exclude_tags: set[str] | None = None) -> str:
    """Recursively extract plain text from XML element, excluding specified tags.

    Args:
        element: XML element to extract text from.
        exclude_tags: Set of tag names to exclude from extraction.

    Returns:
        Plain text string with whitespace normalized and proper punctuation spacing.
    """
    if exclude_tags is None:
        exclude_tags = set()

    parts: list[str] = []

    # Add element's own text (don't strip - preserve leading/trailing spaces)
    if element.text:
        parts.append(element.text)

    # Recursively process children
    for child in element:
        # Skip excluded tags
        if child.tag in exclude_tags:
            # Still need to process tail text after excluded tags
            if child.tail:
                parts.append(child.tail)
            continue

        # Add child text recursively
        child_text = extract_text_recursive(child, exclude_tags)
        if child_text:
            parts.append(child_text)

        # Add tail text (text after closing tag) - don't strip
        if child.tail:
            parts.append(child.tail)

    # Join parts without adding extra spaces
    text = "".join(parts)

    # Normalize whitespace: collapse multiple spaces/newlines into single space
    text = re.sub(r"\s+", " ", text).strip()

    # Fix spacing around punctuation - remove spaces before punctuation
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)

    return text


def extract_abstract(app_elem: ET.Element) -> str | None:
    """Extract plain text abstract from <us-patent-application> element.

    Args:
        app_elem: <us-patent-application> XML element.

    Returns:
        Plain text abstract or None if not found.
    """
    # Find <abstract> element (may be nested)
    abstract_elem = app_elem.find(".//abstract")
    if abstract_elem is None:
        return None

    text = extract_text_recursive(abstract_elem)
    return text if text else None


def extract_claims(app_elem: ET.Element) -> str | None:
    """Extract plain text claims from <us-patent-application> element.

    Excludes <us-claim-statement> tags and inserts newlines at each <claim-text> opening tag.
    Skips claims that contain "(canceled)" or "(cancelled)".

    Args:
        app_elem: <us-patent-application> XML element.

    Returns:
        Plain text claims as single string or None if not found.
    """
    # Find <claims> element (may be nested)
    claims_elem = app_elem.find(".//claims")
    if claims_elem is None:
        return None

    # Find all <claim> elements
    claim_elems = claims_elem.findall(".//claim")
    if not claim_elems:
        return None

    claim_parts: list[str] = []

    for claim_elem in claim_elems:
        # Find all <claim-text> elements within this claim
        claim_text_elems = claim_elem.findall(".//claim-text")

        for ct_elem in claim_text_elems:
            # Extract text excluding <us-claim-statement>
            text = extract_text_recursive(ct_elem, exclude_tags={"us-claim-statement"})

            # Skip canceled/cancelled claims
            if text and ("(canceled)" in text.lower() or "(cancelled)" in text.lower()):
                continue

            if text:
                claim_parts.append(text)

    if not claim_parts:
        return None

    # Join with newlines to separate claim texts
    claims_text = "\n".join(claim_parts)
    return claims_text


def extract_pub_id(app_elem: ET.Element) -> str | None:
    """Extract publication ID from <us-patent-application> element.

    Constructs pub_id as {country}-{doc_number}-{kind}.

    Args:
        app_elem: <us-patent-application> XML element.

    Returns:
        Publication ID string or None if components missing.
    """
    # Find <publication-reference> element
    pub_ref = app_elem.find(".//publication-reference/document-id")
    if pub_ref is None:
        return None

    country_elem = pub_ref.find("country")
    doc_num_elem = pub_ref.find("doc-number")
    kind_elem = pub_ref.find("kind")

    if country_elem is None or doc_num_elem is None or kind_elem is None:
        return None

    country = country_elem.text.strip() if country_elem.text else ""
    doc_number = doc_num_elem.text.strip() if doc_num_elem.text else ""
    kind = kind_elem.text.strip() if kind_elem.text else ""

    if not (country and doc_number and kind):
        return None

    return f"{country}-{doc_number}-{kind}"


def parse_xml_file(xml_path: str) -> Iterator[PatentFullText]:
    """Parse USPTO bulk XML file and yield PatentFullText records.

    USPTO bulk XML files contain multiple <us-patent-application> root elements
    without a single wrapping element. This function wraps the file content
    to create valid XML for parsing.

    Args:
        xml_path: Path to XML file.

    Yields:
        PatentFullText instances.
    """
    logger.info(f"Parsing XML file: {xml_path}")

    count = 0

    # Read and wrap the file to handle multiple root elements
    with open(xml_path, 'r', encoding='utf-8') as f:
        # Read first few lines to check for XML declaration
        first_line = f.readline()
        f.seek(0)

        # Create a temporary wrapped XML string for each application
        # We'll parse applications one at a time to minimize memory usage
        buffer = []
        in_application = False
        depth = 0

        for line in f:
            # Skip XML declaration lines
            if line.strip().startswith('<?xml'):
                continue
            if line.strip().startswith('<!DOCTYPE'):
                continue

            # Track when we enter/exit us-patent-application
            if '<us-patent-application' in line:
                in_application = True
                depth += line.count('<us-patent-application')
                buffer.append(line)
            elif in_application:
                buffer.append(line)
                # Track nesting depth
                depth += line.count('<us-patent-application')
                depth -= line.count('</us-patent-application>')

                # When we've closed all applications, parse the buffer
                if depth == 0:
                    count += 1
                    xml_string = ''.join(buffer)

                    try:
                        elem = ET.fromstring(xml_string)

                        pub_id = extract_pub_id(elem)
                        if not pub_id:
                            logger.warning(f"Record {count}: missing pub_id, skipping")
                            buffer = []
                            in_application = False
                            continue

                        abstract = extract_abstract(elem)
                        claims_text = extract_claims(elem)

                        # Only yield if we have at least one field to update
                        if abstract or claims_text:
                            yield PatentFullText(
                                pub_id=pub_id,
                                abstract=abstract,
                                claims_text=claims_text,
                            )
                        else:
                            logger.debug(f"Record {count} ({pub_id}): no abstract or claims found")

                    except Exception as e:
                        logger.error(f"Error parsing record {count}: {e}")

                    finally:
                        # Clear buffer for next application
                        buffer = []
                        in_application = False

    logger.info(f"Finished parsing {count} records from {xml_path}")


# ----------------------
# Postgres upsert stage
# ----------------------

def upsert_fulltext(conn: PgConn, record: PatentFullText) -> bool:
    """Upsert abstract and claims_text for existing patent_staging record.

    Args:
        conn: Postgres connection.
        record: PatentFullText instance to upsert.

    Returns:
        True if record was updated, False if record not found in staging.

    Raises:
        Exception: For database errors that should be handled by caller.
    """
    with conn.cursor() as cur:
        # Check if record exists
        cur.execute(CHECK_RECORD_EXISTS_SQL, {"pub_id": record.pub_id})
        exists = cur.fetchone() is not None

        if not exists:
            logger.debug(f"Record {record.pub_id} not found in patent_staging, skipping")
            return False

        # Update abstract and claims_text
        cur.execute(
            UPDATE_STAGING_SQL,
            {
                "pub_id": record.pub_id,
                "abstract": record.abstract,
                "claims_text": record.claims_text,
            },
        )

        updated = cur.fetchone() is not None
        if updated:
            logger.debug(f"Updated {record.pub_id}")
        else:
            logger.warning(f"Failed to update {record.pub_id}")

        return updated


def upsert_fulltext_with_retry(
    conn: PgConn,
    record: PatentFullText,
    dsn: str,
    max_retries: int = 2
) -> tuple[bool, PgConn]:
    """Upsert with automatic reconnection on connection loss.

    Args:
        conn: Current database connection.
        record: PatentFullText instance to upsert.
        dsn: PostgreSQL DSN for reconnection.
        max_retries: Maximum number of retry attempts.

    Returns:
        Tuple of (success, connection) where connection may be a new connection.
    """
    for attempt in range(max_retries):
        try:
            # Check connection health before attempting operation
            if not is_connection_alive(conn):
                logger.warning("Connection lost, attempting to reconnect...")
                try:
                    conn.close()
                except Exception:
                    pass
                conn = create_connection(dsn)

            result = upsert_fulltext(conn, record)
            return result, conn

        except (
            psycopg.OperationalError,
            psycopg.InterfaceError,
            psycopg.errors.IdleInTransactionSessionTimeout
        ) as e:
            logger.warning(f"Database connection error on attempt {attempt + 1}: {e}")

            # Try to safely rollback
            safe_rollback(conn)

            if attempt < max_retries - 1:
                # Reconnect and retry
                try:
                    conn.close()
                except Exception:
                    pass

                logger.info("Reconnecting to database...")
                conn = create_connection(dsn)
            else:
                logger.error(f"Failed to process record {record.pub_id} after {max_retries} attempts")
                raise

    # Should never reach here, but for type safety
    return False, conn


# -----------
# CLI / main
# -----------

def parse_args() -> argparse.Namespace:
    """Parse command line arguments.

    Returns:
        Parsed arguments namespace.
    """
    p = argparse.ArgumentParser(
        description="Load patent full text from USPTO XML into patent_staging table"
    )
    p.add_argument(
        "xml_file",
        help="Path to USPTO bulk XML file (e.g., ipa250220.xml)",
    )
    p.add_argument(
        "--dsn",
        default=os.getenv("PG_DSN", ""),
        help="Postgres DSN (default: PG_DSN env var)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse XML but do not write to Postgres",
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Commit every N records (default: 100)",
    )

    return p.parse_args()


def main() -> int:
    """Main execution function.

    Returns:
        Exit code (0 for success, non-zero for errors).
    """
    args = parse_args()

    if not args.dsn:
        logger.error("PG_DSN not set and --dsn not provided")
        return 2

    if not os.path.exists(args.xml_file):
        logger.error(f"XML file not found: {args.xml_file}")
        return 2

    # Parse XML file
    stream = parse_xml_file(args.xml_file)

    total_processed = 0
    total_updated = 0
    total_skipped = 0

    if args.dry_run:
        logger.info("[DRY RUN] Parsing XML without database updates")
        for record in stream:
            total_processed += 1
            logger.info(
                f"[DRY RUN] Would update {record.pub_id} "
                f"(abstract: {bool(record.abstract)}, claims: {bool(record.claims_text)})"
            )
        logger.info(f"[DRY RUN] Processed {total_processed} records")
        return 0

    # Connect to database and process records
    logger.info(f"Connecting to database: {args.dsn.split('@')[-1]}")

    conn = create_connection(args.dsn)

    try:
        batch_count = 0

        for record in stream:
            total_processed += 1
            batch_count += 1

            try:
                # Use retry logic with automatic reconnection
                updated, conn = upsert_fulltext_with_retry(conn, record, args.dsn)

                if updated:
                    total_updated += 1
                else:
                    total_skipped += 1

                # Commit in batches
                if batch_count >= args.batch_size:
                    try:
                        conn.commit()
                        logger.info(
                            f"Committed batch: {total_updated} updated, {total_skipped} skipped, "
                            f"{total_processed} total processed"
                        )
                        batch_count = 0
                    except (psycopg.OperationalError, psycopg.InterfaceError) as e:
                        logger.error(f"Failed to commit batch: {e}")
                        safe_rollback(conn)
                        # Reconnect after commit failure
                        try:
                            conn.close()
                        except Exception:
                            pass
                        conn = create_connection(args.dsn)
                        batch_count = 0

            except Exception as e:
                logger.error(f"Error processing record {record.pub_id}: {e}", exc_info=True)
                safe_rollback(conn)
                batch_count = 0
                # Don't exit on error, continue processing
                continue

        # Commit remaining records
        if batch_count > 0:
            try:
                conn.commit()
                logger.info(f"Committed final batch")
            except (psycopg.OperationalError, psycopg.InterfaceError) as e:
                logger.error(f"Failed to commit final batch: {e}")
                safe_rollback(conn)

    finally:
        # Ensure connection is closed
        try:
            conn.close()
            logger.info("Database connection closed")
        except Exception as e:
            logger.warning(f"Error closing connection: {e}")

    logger.info(
        f"Completed: {total_processed} processed, {total_updated} updated, {total_skipped} skipped"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
