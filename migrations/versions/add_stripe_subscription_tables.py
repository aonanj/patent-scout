"""Add Stripe subscription tables

Revision ID: e1f2g3h4i5j6
Revises: d7e8f9g0h1i2
Create Date: 2025-10-21 12:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2g3h4i5j6"
down_revision: str = "d7e8f9g0h1i2"
branch_labels: str | None = None
depends_on: str | None = None

DDL_UPGRADE = """
-- Step 1: Create subscription tier enum
CREATE TYPE subscription_tier AS ENUM ('beta_tester', 'user');

-- Step 2: Create subscription status enum
CREATE TYPE subscription_status AS ENUM (
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'trialing',
  'unpaid'
);

-- Step 3: Create stripe_customer table
-- Maps Auth0 user IDs to Stripe customer IDs
CREATE TABLE stripe_customer (
  user_id text PRIMARY KEY,
  stripe_customer_id text UNIQUE NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT NOW() NOT NULL,
  updated_at timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX stripe_customer_stripe_id_idx ON stripe_customer (stripe_customer_id);
CREATE INDEX stripe_customer_email_idx ON stripe_customer (email);

-- Step 4: Create price_plan table
-- Defines available subscription plans
CREATE TABLE price_plan (
  stripe_price_id text PRIMARY KEY,
  tier subscription_tier NOT NULL,
  name text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  interval text NOT NULL, -- 'month' or 'year' or 'custom'
  interval_count integer NOT NULL DEFAULT 1, -- 1 for monthly, 12 for yearly, 3 for 90 days
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT NOW() NOT NULL,
  updated_at timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX price_plan_tier_idx ON price_plan (tier);
CREATE INDEX price_plan_is_active_idx ON price_plan (is_active) WHERE is_active = true;

-- Step 5: Create subscription table
-- Tracks active and historical subscriptions
CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  stripe_subscription_id text UNIQUE NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_price_id text NOT NULL,
  tier subscription_tier NOT NULL,
  status subscription_status NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  tier_started_at timestamptz NOT NULL DEFAULT NOW(), -- Track when beta tier started
  created_at timestamptz DEFAULT NOW() NOT NULL,
  updated_at timestamptz DEFAULT NOW() NOT NULL,

  FOREIGN KEY (user_id) REFERENCES stripe_customer (user_id) ON DELETE CASCADE,
  FOREIGN KEY (stripe_customer_id) REFERENCES stripe_customer (stripe_customer_id) ON DELETE CASCADE,
  FOREIGN KEY (stripe_price_id) REFERENCES price_plan (stripe_price_id)
);

CREATE INDEX subscription_user_id_idx ON subscription (user_id);
CREATE INDEX subscription_stripe_subscription_id_idx ON subscription (stripe_subscription_id);
CREATE INDEX subscription_status_idx ON subscription (status);
CREATE INDEX subscription_tier_idx ON subscription (tier);
CREATE INDEX subscription_period_end_idx ON subscription (current_period_end);

-- Composite index for common query: active subscriptions for a user
CREATE INDEX subscription_user_status_idx ON subscription (user_id, status);

-- Step 6: Create subscription_event table
-- Audit log of subscription changes from Stripe webhooks
CREATE TABLE subscription_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  subscription_id uuid,
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  processed_at timestamptz DEFAULT NOW() NOT NULL,

  FOREIGN KEY (subscription_id) REFERENCES subscription (id) ON DELETE SET NULL
);

CREATE INDEX subscription_event_stripe_event_id_idx ON subscription_event (stripe_event_id);
CREATE INDEX subscription_event_subscription_id_idx ON subscription_event (subscription_id);
CREATE INDEX subscription_event_type_idx ON subscription_event (event_type);
CREATE INDEX subscription_event_processed_at_idx ON subscription_event (processed_at);

-- Step 7: Seed price_plan table with predefined tiers
-- Note: stripe_price_id values will need to be updated with actual Stripe price IDs after creating products in Stripe Dashboard
INSERT INTO price_plan (stripe_price_id, tier, name, amount_cents, currency, interval, interval_count, description) VALUES
  -- Beta Tester Tier
  ('prod_THLOpWmscBz30w', 'beta_tester', 'Beta Tester - Monthly', 9900, 'usd', 'month', 1, 'Beta tester access - $99/month (auto-migrates to User tier after 90 days)'),
  ('prod_THLPA42b6aQ7ec', 'beta_tester', 'Beta Tester - 90 Days', 25900, 'usd', 'month', 3, 'Beta tester access - $259 for 90 days (auto-migrates to User tier after period ends)'),

  -- User Tier
  ('prod_THLQlinZFs5Uhy', 'user', 'User - Monthly', 18900, 'usd', 'month', 1, 'Full access - $189/month'),
  ('prod_THLR3OHRS4rtMA', 'user', 'User - Yearly', 189900, 'usd', 'year', 1, 'Full access - $1,899/year');

COMMENT ON TABLE stripe_customer IS 'Maps Auth0 user IDs to Stripe customer IDs';
COMMENT ON TABLE price_plan IS 'Available subscription plans and pricing';
COMMENT ON TABLE subscription IS 'User subscription records synced from Stripe';
COMMENT ON TABLE subscription_event IS 'Audit log of Stripe webhook events';
COMMENT ON COLUMN subscription.tier_started_at IS 'Timestamp when current tier started - used to enforce 90-day beta tester limit';
COMMENT ON COLUMN price_plan.stripe_price_id IS 'Replace placeholder values with actual Stripe Price IDs from Dashboard';

-- Step 8: Create helper function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_active boolean;
BEGIN
  -- Check if user has any active or trialing subscription
  SELECT EXISTS(
    SELECT 1
    FROM subscription
    WHERE user_id = p_user_id
      AND status IN ('active', 'trialing')
      AND current_period_end > NOW()
  ) INTO v_has_active;

  RETURN v_has_active;
END;
$$;

COMMENT ON FUNCTION has_active_subscription(text) IS 'Check if user has an active or trialing subscription';

-- Step 9: Create helper function to get user's current subscription with beta tier expiry check
CREATE OR REPLACE FUNCTION get_user_subscription_status(p_user_id text)
RETURNS TABLE (
  subscription_id uuid,
  tier subscription_tier,
  status subscription_status,
  current_period_end timestamptz,
  days_in_tier integer,
  needs_tier_migration boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.tier,
    s.status,
    s.current_period_end,
    EXTRACT(DAY FROM NOW() - s.tier_started_at)::integer AS days_in_tier,
    -- Beta testers need migration after 90 days
    (s.tier = 'beta_tester' AND EXTRACT(DAY FROM NOW() - s.tier_started_at) >= 90) AS needs_tier_migration
  FROM subscription s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.current_period_end DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_user_subscription_status(text) IS 'Get user subscription with beta tier expiry check (90 days)';

-- Step 10: Create view for easy subscription status lookups
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT
  s.id,
  s.user_id,
  s.stripe_subscription_id,
  s.tier,
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.tier_started_at,
  EXTRACT(DAY FROM NOW() - s.tier_started_at)::integer AS days_in_current_tier,
  CASE
    WHEN s.tier = 'beta_tester' AND EXTRACT(DAY FROM NOW() - s.tier_started_at) >= 90
    THEN true
    ELSE false
  END AS requires_tier_migration,
  s.cancel_at_period_end,
  s.canceled_at,
  pp.name AS plan_name,
  pp.amount_cents,
  pp.currency,
  pp.interval,
  sc.email
FROM subscription s
JOIN price_plan pp ON s.stripe_price_id = pp.stripe_price_id
JOIN stripe_customer sc ON s.user_id = sc.user_id
WHERE s.status IN ('active', 'trialing', 'past_due')
  AND s.current_period_end > NOW();

COMMENT ON VIEW active_subscriptions IS 'Denormalized view of active subscriptions with plan details';
"""

DDL_DOWNGRADE = """
-- Drop view and functions first
DROP VIEW IF EXISTS active_subscriptions CASCADE;
DROP FUNCTION IF EXISTS get_user_subscription_status(text) CASCADE;
DROP FUNCTION IF EXISTS has_active_subscription(text) CASCADE;

-- Drop tables in reverse order (respecting foreign keys)
DROP TABLE IF EXISTS subscription_event CASCADE;
DROP TABLE IF EXISTS subscription CASCADE;
DROP TABLE IF EXISTS price_plan CASCADE;
DROP TABLE IF EXISTS stripe_customer CASCADE;

-- Drop enums
DROP TYPE IF EXISTS subscription_status;
DROP TYPE IF EXISTS subscription_tier;
"""


def upgrade() -> None:
    """Add Stripe subscription tables."""
    op.execute(DDL_UPGRADE)


def downgrade() -> None:
    """Remove Stripe subscription tables."""
    op.execute(DDL_DOWNGRADE)
