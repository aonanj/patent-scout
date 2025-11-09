"""Backfill patent_assignee join table from patent rows.

Revision ID: f1a2b3c4d5e6
Revises: h2i3j4k5l6m7
Create Date: 2025-10-22 00:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str = "h2i3j4k5l6m7"
branch_labels: str | None = None
depends_on: str | None = None

# Copy existing single-assignee data into the new join table. We rely on
# canonical/alias ids already populated on patent rows by add_canon_name.py.
DDL_UPGRADE = """
WITH src AS (
    SELECT
        p.pub_id,
        p.assignee_alias_id AS alias_id,
        p.canonical_assignee_name_id AS canonical_id,
        ROW_NUMBER() OVER (PARTITION BY p.pub_id ORDER BY p.pub_id) AS position
    FROM patent p
    WHERE p.assignee_alias_id IS NOT NULL
      AND p.canonical_assignee_name_id IS NOT NULL
)
INSERT INTO patent_assignee (pub_id, alias_id, canonical_id, position)
SELECT pub_id, alias_id, canonical_id, position
FROM src
ON CONFLICT (pub_id, alias_id) DO NOTHING;
"""

# Reverse the backfill by deleting rows that mirror the single-assignee mapping.
DDL_DOWNGRADE = """
DELETE FROM patent_assignee pa
USING patent p
WHERE pa.pub_id = p.pub_id
  AND p.assignee_alias_id IS NOT NULL
  AND pa.alias_id = p.assignee_alias_id;
"""


def upgrade() -> None:
    """Populate patent_assignee with existing patent metadata."""
    op.execute(DDL_UPGRADE)


def downgrade() -> None:
    """Remove backfilled patent_assignee rows."""
    op.execute(DDL_DOWNGRADE)
