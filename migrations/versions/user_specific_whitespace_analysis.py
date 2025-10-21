"""Create user-specific whitespace analysis table

Revision ID: d7e8f9g0h1i2
Revises: c5f9d6e7a8b9
Create Date: 2025-10-21 00:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e8f9g0h1i2"
down_revision: str = "c5f9d6e7a8b9"
branch_labels: str | None = None
depends_on: str | None = None

DDL_UPGRADE = """
-- Step 1: Create new user-specific whitespace analysis table
CREATE TABLE IF NOT EXISTS user_whitespace_analysis (
  user_id text NOT NULL,
  pub_id text NOT NULL,
  model text NOT NULL,
  cluster_id integer,
  local_density real,
  whitespace_score real,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  PRIMARY KEY (user_id, pub_id, model),
  FOREIGN KEY (pub_id) REFERENCES patent(pub_id) ON DELETE CASCADE
);

-- Step 2: Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS user_whitespace_analysis_user_id_idx
  ON user_whitespace_analysis (user_id);
CREATE INDEX IF NOT EXISTS user_whitespace_analysis_pub_id_idx
  ON user_whitespace_analysis (pub_id);
CREATE INDEX IF NOT EXISTS user_whitespace_analysis_model_idx
  ON user_whitespace_analysis (model);
CREATE INDEX IF NOT EXISTS user_whitespace_analysis_cluster_id_idx
  ON user_whitespace_analysis (cluster_id) WHERE cluster_id IS NOT NULL;

-- Step 3: Migrate existing data from patent_embeddings to user_whitespace_analysis
-- Assign to a 'system' user_id for any existing analysis data
INSERT INTO user_whitespace_analysis (user_id, pub_id, model, cluster_id, local_density, whitespace_score)
SELECT
  'system' AS user_id,
  pub_id,
  model,
  cluster_id,
  local_density,
  whitespace_score
FROM patent_embeddings
WHERE cluster_id IS NOT NULL
   OR local_density IS NOT NULL
   OR whitespace_score IS NOT NULL
ON CONFLICT (user_id, pub_id, model) DO NOTHING;

-- Step 4: Drop the old cluster_stats materialized view (it was based on patent_embeddings)
DROP MATERIALIZED VIEW IF EXISTS cluster_stats;

-- Step 5: Remove columns from patent_embeddings
ALTER TABLE patent_embeddings DROP COLUMN IF EXISTS cluster_id;
ALTER TABLE patent_embeddings DROP COLUMN IF EXISTS local_density;
ALTER TABLE patent_embeddings DROP COLUMN IF EXISTS whitespace_score;

-- Step 6: Create user-specific cluster stats view (optional - can be materialized if needed)
-- This is a regular view that filters by user_id when queried
CREATE OR REPLACE VIEW user_cluster_stats AS
SELECT
  uwa.user_id,
  uwa.cluster_id,
  uwa.model,
  COUNT(*)::int AS n,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.pub_date) AS median_pub_date,
  JSONB_AGG(DISTINCT p.assignee_name) FILTER (WHERE p.assignee_name IS NOT NULL) AS assignees,
  JSONB_AGG(DISTINCT p.cpc) FILTER (WHERE p.cpc IS NOT NULL) AS cpcs
FROM user_whitespace_analysis uwa
JOIN patent p ON p.pub_id = uwa.pub_id
WHERE uwa.cluster_id IS NOT NULL
GROUP BY uwa.user_id, uwa.cluster_id, uwa.model;

CREATE INDEX IF NOT EXISTS user_cluster_stats_idx
  ON user_whitespace_analysis (user_id, cluster_id, model)
  WHERE cluster_id IS NOT NULL;
"""

DDL_DOWNGRADE = """
-- Step 1: Re-add columns to patent_embeddings
ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS cluster_id integer;
ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS local_density real;
ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS whitespace_score real;

-- Step 2: Migrate data back from user_whitespace_analysis to patent_embeddings
-- Only migrate 'system' user data back
UPDATE patent_embeddings e
SET cluster_id = uwa.cluster_id,
    local_density = uwa.local_density,
    whitespace_score = uwa.whitespace_score
FROM user_whitespace_analysis uwa
WHERE e.pub_id = uwa.pub_id
  AND e.model = uwa.model
  AND uwa.user_id = 'system';

-- Step 3: Drop the user-specific view
DROP VIEW IF EXISTS user_cluster_stats;

-- Step 4: Recreate original cluster_stats materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS cluster_stats AS
SELECT
  e.cluster_id,
  COUNT(*)::int AS n,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.pub_date) AS median_pub_date,
  JSONB_AGG(DISTINCT p.assignee_name) FILTER (WHERE p.assignee_name IS NOT NULL) AS assignees,
  JSONB_AGG(DISTINCT p.cpc) FILTER (WHERE p.cpc IS NOT NULL) AS cpcs
FROM patent_embeddings e
JOIN patent p ON p.pub_id = e.pub_id
WHERE e.cluster_id IS NOT NULL
GROUP BY e.cluster_id;

CREATE UNIQUE INDEX IF NOT EXISTS cluster_stats_cluster_id_idx ON cluster_stats (cluster_id);

-- Step 5: Drop the user_whitespace_analysis table and its indexes
DROP INDEX IF EXISTS user_cluster_stats_idx;
DROP INDEX IF EXISTS user_whitespace_analysis_cluster_id_idx;
DROP INDEX IF EXISTS user_whitespace_analysis_model_idx;
DROP INDEX IF EXISTS user_whitespace_analysis_pub_id_idx;
DROP INDEX IF EXISTS user_whitespace_analysis_user_id_idx;
DROP TABLE IF EXISTS user_whitespace_analysis;
"""


def upgrade() -> None:
    """Create user-specific whitespace analysis table."""
    op.execute(DDL_UPGRADE)


def downgrade() -> None:
    """Remove user-specific whitespace analysis table and restore old structure."""
    op.execute(DDL_DOWNGRADE)
