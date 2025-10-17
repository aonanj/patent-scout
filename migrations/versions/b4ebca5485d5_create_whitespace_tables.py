"""Create whitespace tables

Revision ID: b4ebca5485d5
Revises: 
Create Date: 2025-10-17 09:18:03.797769

"""
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b4ebca5485d5'
# revision identifiers, used by Alembic.
revision: str = 'b4ebca5485d5'
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None
DDL_UPGRADE = """
CREATE TABLE IF NOT EXISTS knn_edge (
  src text NOT NULL,
  dst text NOT NULL,
  w   real NOT NULL,
  PRIMARY KEY (src, dst)
);

ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS cluster_id integer;
ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS local_density real;
ALTER TABLE patent_embeddings ADD COLUMN IF NOT EXISTS whitespace_score real;

CREATE MATERIALIZED VIEW IF NOT EXISTS cluster_stats AS
SELECT
  e.cluster_id,
  count(*)::int AS n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY p.pub_date) AS median_pub_date,
  jsonb_agg(DISTINCT p.assignee_name) FILTER (WHERE p.assignee_name IS NOT NULL) AS assignees,
  jsonb_agg(DISTINCT p.cpc) FILTER (WHERE p.cpc IS NOT NULL) AS cpcs
FROM patent_embeddings e
JOIN patent p ON p.pub_id = e.pub_id
WHERE e.cluster_id IS NOT NULL
GROUP BY e.cluster_id;

CREATE UNIQUE INDEX IF NOT EXISTS cluster_stats_cluster_id_idx ON cluster_stats (cluster_id);
"""

DDL_DOWNGRADE = """
DROP INDEX IF EXISTS cluster_stats_cluster_id_idx;
DROP MATERIALIZED VIEW IF EXISTS cluster_stats;

ALTER TABLE patent_embeddings DROP COLUMN IF EXISTS cluster_id;
ALTER TABLE patent_embeddings DROP COLUMN IF EXISTS local_density;
ALTER TABLE patent_embeddings DROP COLUMN IF EXISTS whitespace_score;

DROP TABLE IF EXISTS knn_edge;
"""


def upgrade() -> None:
    """Create whitespace graph tables and supporting objects."""
    op.execute(DDL_UPGRADE)


def downgrade() -> None:
    """Remove whitespace graph tables and supporting objects."""
    op.execute(DDL_DOWNGRADE)
