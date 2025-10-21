"""Add user_id to knn_edge for user isolation

Revision ID: c5f9d6e7a8b9
Revises: b4ebca5485d5
Create Date: 2025-10-19 00:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c5f9d6e7a8b9'
down_revision: str = 'b4ebca5485d5'
branch_labels: str | None = None
depends_on: str | None = None

DDL_UPGRADE = """
-- Step 1: Drop the existing primary key constraint
ALTER TABLE knn_edge DROP CONSTRAINT IF EXISTS knn_edge_pkey;

-- Step 2: Add user_id column (nullable initially to handle existing data)
ALTER TABLE knn_edge ADD COLUMN IF NOT EXISTS user_id text;

-- Step 3: For existing data, either delete it or assign to a default user
-- Option A: Delete all existing data (recommended if data is test/temporary)
TRUNCATE TABLE knn_edge;

-- Option B: Assign existing data to a default user (uncomment if needed)
-- UPDATE knn_edge SET user_id = 'system' WHERE user_id IS NULL;

-- Step 4: Make user_id NOT NULL after handling existing data
ALTER TABLE knn_edge ALTER COLUMN user_id SET NOT NULL;

-- Step 5: Create new composite primary key with user_id
ALTER TABLE knn_edge ADD PRIMARY KEY (user_id, src, dst);

-- Step 6: Add index for efficient user-specific queries
CREATE INDEX IF NOT EXISTS knn_edge_user_id_idx ON knn_edge (user_id);
"""

DDL_DOWNGRADE = """
-- Remove the index
DROP INDEX IF EXISTS knn_edge_user_id_idx;

-- Drop the composite primary key
ALTER TABLE knn_edge DROP CONSTRAINT IF EXISTS knn_edge_pkey;

-- Remove user_id column
ALTER TABLE knn_edge DROP COLUMN IF EXISTS user_id;

-- Restore original primary key
ALTER TABLE knn_edge ADD PRIMARY KEY (src, dst);
"""


def upgrade() -> None:
    """Add user_id column to knn_edge table for user isolation."""
    op.execute(DDL_UPGRADE)


def downgrade() -> None:
    """Remove user_id column from knn_edge table."""
    op.execute(DDL_DOWNGRADE)
