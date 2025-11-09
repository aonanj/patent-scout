"""Rename whitespace analytics objects to overview.

Revision ID: h2i3j4k5l6m7
Revises: e1f2g3h4i5j6
Create Date: 2025-11-04 00:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h2i3j4k5l6m7"
down_revision: str = "e1f2g3h4i5j6"
branch_labels: str | None = None
depends_on: str | None = None


DDL_UPGRADE = """
DROP VIEW IF EXISTS user_cluster_stats;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_whitespace_analysis'
  ) THEN
    EXECUTE 'ALTER TABLE user_whitespace_analysis RENAME TO user_overview_analysis';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_whitespace_analysis_user_id_idx') THEN
    EXECUTE 'ALTER INDEX user_whitespace_analysis_user_id_idx RENAME TO user_overview_analysis_user_id_idx';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_whitespace_analysis_pub_id_idx') THEN
    EXECUTE 'ALTER INDEX user_whitespace_analysis_pub_id_idx RENAME TO user_overview_analysis_pub_id_idx';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_whitespace_analysis_model_idx') THEN
    EXECUTE 'ALTER INDEX user_whitespace_analysis_model_idx RENAME TO user_overview_analysis_model_idx';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_whitespace_analysis_cluster_id_idx') THEN
    EXECUTE 'ALTER INDEX user_whitespace_analysis_cluster_id_idx RENAME TO user_overview_analysis_cluster_id_idx';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_overview_analysis' AND column_name = 'whitespace_score'
  ) THEN
    EXECUTE 'ALTER TABLE user_overview_analysis RENAME COLUMN whitespace_score TO overview_score';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patent_embeddings' AND column_name = 'whitespace_score'
  ) THEN
    EXECUTE 'ALTER TABLE patent_embeddings RENAME COLUMN whitespace_score TO overview_score';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'whitespace_crowding_percentiles'
  ) THEN
    EXECUTE 'ALTER TABLE whitespace_crowding_percentiles RENAME TO overview_crowding_percentiles';
  END IF;
END $$;

CREATE OR REPLACE VIEW user_cluster_stats AS
SELECT
  uwa.user_id,
  uwa.cluster_id,
  uwa.model,
  COUNT(*)::int AS n,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.pub_date) AS median_pub_date,
  JSONB_AGG(DISTINCT p.assignee_name) FILTER (WHERE p.assignee_name IS NOT NULL) AS assignees,
  JSONB_AGG(DISTINCT p.cpc) FILTER (WHERE p.cpc IS NOT NULL) AS cpcs
FROM user_overview_analysis uwa
JOIN patent p ON p.pub_id = uwa.pub_id
WHERE uwa.cluster_id IS NOT NULL
GROUP BY uwa.user_id, uwa.cluster_id, uwa.model;
"""


DDL_DOWNGRADE = """
DROP VIEW IF EXISTS user_cluster_stats;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_overview_analysis'
  ) THEN
    EXECUTE 'ALTER TABLE user_overview_analysis RENAME TO user_whitespace_analysis';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_overview_analysis_user_id_idx') THEN
    EXECUTE 'ALTER INDEX user_overview_analysis_user_id_idx RENAME TO user_whitespace_analysis_user_id_idx';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_overview_analysis_pub_id_idx') THEN
    EXECUTE 'ALTER INDEX user_overview_analysis_pub_id_idx RENAME TO user_whitespace_analysis_pub_id_idx';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_overview_analysis_model_idx') THEN
    EXECUTE 'ALTER INDEX user_overview_analysis_model_idx RENAME TO user_whitespace_analysis_model_idx';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_overview_analysis_cluster_id_idx') THEN
    EXECUTE 'ALTER INDEX user_overview_analysis_cluster_id_idx RENAME TO user_whitespace_analysis_cluster_id_idx';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_whitespace_analysis' AND column_name = 'overview_score'
  ) THEN
    EXECUTE 'ALTER TABLE user_whitespace_analysis RENAME COLUMN overview_score TO whitespace_score';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patent_embeddings' AND column_name = 'overview_score'
  ) THEN
    EXECUTE 'ALTER TABLE patent_embeddings RENAME COLUMN overview_score TO whitespace_score';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'overview_crowding_percentiles'
  ) THEN
    EXECUTE 'ALTER TABLE overview_crowding_percentiles RENAME TO whitespace_crowding_percentiles';
  END IF;
END $$;

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
"""


def upgrade() -> None:
    """Rename whitespace analytics objects to overview."""
    op.execute(DDL_UPGRADE)


def downgrade() -> None:
    """Revert overview naming back to whitespace."""
    op.execute(DDL_DOWNGRADE)
