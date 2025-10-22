"""Tests for subscription middleware.

Run with: pytest tests/test_subscription_middleware.py -v
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.subscription_middleware import (
    SubscriptionInfo,
    SubscriptionRequiredError,
    check_active_subscription,
    get_subscription_info,
    require_active_subscription,
)


@pytest.fixture
def mock_conn():
    """Mock database connection."""
    conn = MagicMock()
    # cursor() should be a regular (non-async) method that returns a context manager
    return conn


@pytest.fixture
def mock_user():
    """Mock authenticated user from Auth0."""
    return {"sub": "auth0|test_user_123", "email": "test@example.com"}


@pytest.fixture
def mock_cursor():
    """Mock database cursor that supports async context manager."""
    cursor = MagicMock()
    cursor.__aenter__ = AsyncMock(return_value=cursor)
    cursor.__aexit__ = AsyncMock(return_value=None)
    cursor.execute = AsyncMock()
    cursor.fetchone = AsyncMock()
    cursor.fetchall = AsyncMock()
    return cursor


class TestSubscriptionInfo:
    """Test SubscriptionInfo data class."""

    def test_no_subscription(self):
        """Test SubscriptionInfo for user without subscription."""
        info = SubscriptionInfo(has_active=False)

        assert info.has_active is False
        assert info.tier is None
        assert info.status is None
        assert info.days_in_tier is None
        assert info.needs_migration is False

    def test_active_subscription(self):
        """Test SubscriptionInfo for user with active subscription."""
        info = SubscriptionInfo(
            has_active=True,
            tier="user",
            status="active",
            days_in_tier=30,
            needs_migration=False,
        )

        assert info.has_active is True
        assert info.tier == "user"
        assert info.status == "active"
        assert info.days_in_tier == 30
        assert info.needs_migration is False

    def test_beta_migration_needed(self):
        """Test SubscriptionInfo for beta tester needing migration."""
        info = SubscriptionInfo(
            has_active=True,
            tier="beta_tester",
            status="active",
            days_in_tier=95,
            needs_migration=True,
        )

        assert info.has_active is True
        assert info.tier == "beta_tester"
        assert info.needs_migration is True


class TestCheckActiveSubscription:
    """Test check_active_subscription function."""

    @pytest.mark.asyncio
    async def test_has_active_subscription(self, mock_conn, mock_cursor):
        """Test user with active subscription."""
        mock_cursor.fetchone.return_value = (True,)
        mock_conn.cursor.return_value = mock_cursor

        result = await check_active_subscription("auth0|user_123", mock_conn)

        assert result is True
        mock_cursor.execute.assert_called_once_with(
            "SELECT has_active_subscription(%s)", ["auth0|user_123"]
        )

    @pytest.mark.asyncio
    async def test_no_active_subscription(self, mock_conn, mock_cursor):
        """Test user without active subscription."""
        mock_cursor.fetchone.return_value = (False,)
        mock_conn.cursor.return_value = mock_cursor

        result = await check_active_subscription("auth0|user_456", mock_conn)

        assert result is False

    @pytest.mark.asyncio
    async def test_no_result(self, mock_conn, mock_cursor):
        """Test when database returns no result."""
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        result = await check_active_subscription("auth0|user_789", mock_conn)

        assert result is False


class TestGetSubscriptionInfo:
    """Test get_subscription_info function."""

    @pytest.mark.asyncio
    async def test_active_user_subscription(self, mock_conn, mock_cursor):
        """Test getting info for user with active subscription."""
        mock_cursor.fetchone.return_value = {
            "tier": "user",
            "status": "active",
            "current_period_end": datetime.now() + timedelta(days=30),
            "days_in_tier": 15,
            "needs_tier_migration": False,
        }
        mock_conn.cursor.return_value = mock_cursor

        info = await get_subscription_info("auth0|user_123", mock_conn)

        assert info.has_active is True
        assert info.tier == "user"
        assert info.status == "active"
        assert info.days_in_tier == 15
        assert info.needs_migration is False

    @pytest.mark.asyncio
    async def test_beta_tester_needs_migration(self, mock_conn, mock_cursor):
        """Test beta tester who needs migration."""
        mock_cursor.fetchone.return_value = {
            "tier": "beta_tester",
            "status": "active",
            "current_period_end": datetime.now() + timedelta(days=5),
            "days_in_tier": 92,
            "needs_tier_migration": True,
        }
        mock_conn.cursor.return_value = mock_cursor

        info = await get_subscription_info("auth0|beta_user", mock_conn)

        assert info.has_active is True
        assert info.tier == "beta_tester"
        assert info.days_in_tier == 92
        assert info.needs_migration is True

    @pytest.mark.asyncio
    async def test_no_subscription_found(self, mock_conn, mock_cursor):
        """Test user without any subscription."""
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value = mock_cursor

        info = await get_subscription_info("auth0|no_sub", mock_conn)

        assert info.has_active is False
        assert info.tier is None
        assert info.status is None


class TestRequireActiveSubscription:
    """Test require_active_subscription dependency."""

    @pytest.mark.asyncio
    async def test_allows_user_with_subscription(self, mock_conn, mock_cursor, mock_user):
        """Test that users with subscriptions are allowed."""
        mock_cursor.fetchone.return_value = (True,)
        mock_conn.cursor.return_value = mock_cursor

        result = await require_active_subscription(mock_conn, mock_user)

        assert result == mock_user

    @pytest.mark.asyncio
    async def test_denies_user_without_subscription(self, mock_conn, mock_cursor, mock_user):
        """Test that users without subscriptions are denied."""
        mock_cursor.fetchone.return_value = (False,)
        mock_conn.cursor.return_value = mock_cursor

        with pytest.raises(SubscriptionRequiredError) as exc_info:
            await require_active_subscription(mock_conn, mock_user)

        assert exc_info.value.status_code == 403
        assert "subscription" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_missing_sub_claim(self, mock_conn):
        """Test error when user token missing 'sub' claim."""
        user_without_sub = {"email": "test@example.com"}

        with pytest.raises(HTTPException) as exc_info:
            await require_active_subscription(mock_conn, user_without_sub)

        assert exc_info.value.status_code == 400
        assert "sub" in exc_info.value.detail.lower()


class TestSubscriptionRequiredError:
    """Test SubscriptionRequiredError exception."""

    def test_default_message(self):
        """Test default error message."""
        error = SubscriptionRequiredError()

        assert error.status_code == 403
        assert "subscription" in error.detail.lower()

    def test_custom_message(self):
        """Test custom error message."""
        error = SubscriptionRequiredError(detail="Premium feature requires subscription")

        assert error.status_code == 403
        assert error.detail == "Premium feature requires subscription"


# Integration-style tests (require actual database)
# Uncomment and adapt these if you have a test database set up


# @pytest.mark.integration
# @pytest.mark.asyncio
# async def test_end_to_end_subscription_check(test_db_conn):
#     """Test full subscription check flow with real database."""
#     user_id = "auth0|integration_test_user"
#
#     # Create test subscription
#     async with test_db_conn.cursor() as cur:
#         await cur.execute(
#             "INSERT INTO stripe_customer (user_id, stripe_customer_id, email) "
#             "VALUES (%s, %s, %s)",
#             [user_id, "cus_test123", "test@example.com"],
#         )
#
#         await cur.execute(
#             "INSERT INTO subscription (user_id, stripe_subscription_id, "
#             "stripe_customer_id, stripe_price_id, tier, status, "
#             "current_period_start, current_period_end) "
#             "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
#             [
#                 user_id,
#                 "sub_test123",
#                 "cus_test123",
#                 "price_test",
#                 "user",
#                 "active",
#                 datetime.now() - timedelta(days=1),
#                 datetime.now() + timedelta(days=30),
#             ],
#         )
#
#     # Test subscription check
#     has_active = await check_active_subscription(user_id, test_db_conn)
#     assert has_active is True
#
#     info = await get_subscription_info(user_id, test_db_conn)
#     assert info.has_active is True
#     assert info.tier == "user"
#     assert info.status == "active"
#
#     # Cleanup
#     async with test_db_conn.cursor() as cur:
#         await cur.execute("DELETE FROM subscription WHERE user_id = %s", [user_id])
#         await cur.execute("DELETE FROM stripe_customer WHERE user_id = %s", [user_id])
