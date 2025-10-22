"""Subscription access control middleware.

This module provides FastAPI dependencies for protecting routes based on
subscription status. It integrates with Auth0 authentication and the Stripe
subscription system.

Usage:
    from app.subscription_middleware import require_active_subscription

    @app.get("/premium-feature")
    async def premium_feature(user: Annotated[dict, Depends(require_active_subscription)]):
        # Only users with active subscriptions can access this endpoint
        return {"data": "premium content"}
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from psycopg import AsyncConnection
from psycopg.rows import dict_row

from app.auth import get_current_user
from app.db import get_conn
from infrastructure.logger import get_logger

logger = get_logger()


class SubscriptionRequiredError(HTTPException):
    """Raised when user lacks required subscription."""

    def __init__(self, detail: str = "Active subscription required", **kwargs):
        """Returns HTTP 403 Forbidden."""
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            **kwargs,
        )


class SubscriptionInfo:
    """Container for subscription information.

    Attributes:
        has_active: Whether user has any active subscription
        tier: Current subscription tier ('beta_tester' or 'user')
        status: Subscription status (e.g., 'active', 'past_due')
        days_in_tier: Days since tier started
        needs_migration: Whether beta tester needs migration to user tier
        period_end: End of current billing period
    """

    def __init__(
        self,
        has_active: bool,
        tier: str | None = None,
        status: str | None = None,
        days_in_tier: int | None = None,
        needs_migration: bool = False,
        period_end: str | None = None,
    ):
        self.has_active = has_active
        self.tier = tier
        self.status = status
        self.days_in_tier = days_in_tier
        self.needs_migration = needs_migration
        self.period_end = period_end

    def __repr__(self) -> str:
        return (
            f"SubscriptionInfo(has_active={self.has_active}, tier={self.tier}, "
            f"status={self.status}, days_in_tier={self.days_in_tier})"
        )


async def get_subscription_info(
    user_id: str, conn: AsyncConnection
) -> SubscriptionInfo:
    """Get detailed subscription information for a user.

    Args:
        user_id: Auth0 user ID (from JWT 'sub' claim)
        conn: Database connection

    Returns:
        SubscriptionInfo object with subscription details
    """
    # Use the database function we created in the migration
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT * FROM get_user_subscription_status(%s)",
            [user_id],
        )
        result = await cur.fetchone()

    if not result:
        # No active subscription found
        return SubscriptionInfo(has_active=False)

    # Convert period_end datetime to ISO format string
    period_end = result.get("current_period_end")
    period_end_str = period_end.isoformat() if period_end else None

    return SubscriptionInfo(
        has_active=True,
        tier=result.get("tier"),
        status=result.get("status"),
        days_in_tier=result.get("days_in_tier"),
        needs_migration=result.get("needs_tier_migration", False),
        period_end=period_end_str,
    )


async def check_active_subscription(user_id: str, conn: AsyncConnection) -> bool:
    """Check if user has an active subscription (fast boolean check).

    This uses the optimized SQL function for quick access control checks.

    Args:
        user_id: Auth0 user ID
        conn: Database connection

    Returns:
        True if user has active or trialing subscription
    """
    async with conn.cursor() as cur:
        await cur.execute("SELECT has_active_subscription(%s)", [user_id])
        result = await cur.fetchone()
        return result[0] if result else False


async def get_subscription_status_for_user(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[dict, Depends(get_current_user)],
) -> SubscriptionInfo:
    """Get subscription info for authenticated user.

    This is a FastAPI dependency that can be used to get subscription details
    without enforcing an active subscription requirement.

    Args:
        conn: Database connection (injected)
        user: Authenticated user from Auth0 (injected)

    Returns:
        SubscriptionInfo object

    Example:
        @app.get("/account")
        async def account(
            sub_info: Annotated[SubscriptionInfo, Depends(get_subscription_status_for_user)]
        ):
            return {"tier": sub_info.tier, "needs_upgrade": not sub_info.has_active}
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User missing 'sub' claim",
        )

    return await get_subscription_info(user_id, conn)


async def require_active_subscription(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Require user to have an active subscription.

    This is the main dependency for protecting premium routes. It validates
    that the user is authenticated AND has an active subscription.

    Args:
        conn: Database connection (injected)
        user: Authenticated user from Auth0 (injected)

    Returns:
        User dict if subscription is active

    Raises:
        SubscriptionRequiredError: If no active subscription found

    Example:
        @app.post("/premium-search")
        async def premium_search(
            user: Annotated[dict, Depends(require_active_subscription)]
        ):
            # Only accessible to users with active subscriptions
            return {"results": [...]}
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User missing 'sub' claim",
        )

    has_active = await check_active_subscription(user_id, conn)

    if not has_active:
        logger.error(
            f"Access denied for user {user_id}: no active subscription found"
        )
        raise SubscriptionRequiredError(
            detail="This feature requires an active subscription. "
            "Please subscribe to continue."
        )

    return user


async def require_tier(
    tier: Literal["beta_tester", "user"],
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Require user to have a specific subscription tier.

    Note: This is a lower-level function. For most use cases, you should use
    require_active_subscription instead, since both tiers have full access.

    Args:
        tier: Required tier ('beta_tester' or 'user')
        conn: Database connection (injected)
        user: Authenticated user from Auth0 (injected)

    Returns:
        User dict if tier matches

    Raises:
        SubscriptionRequiredError: If tier doesn't match
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User missing 'sub' claim",
        )

    sub_info = await get_subscription_info(user_id, conn)

    if not sub_info.has_active:
        logger.error(f"Access denied for user {user_id}: no active subscription")
        raise SubscriptionRequiredError(
            detail="This feature requires an active subscription."
        )

    if sub_info.tier != tier:
        logger.error(
            f"Access denied for user {user_id}: tier {sub_info.tier} != {tier}"
        )
        raise SubscriptionRequiredError(
            detail=f"This feature requires {tier} tier subscription."
        )

    return user


# Convenience type aliases for route dependencies
ActiveSubscription = Annotated[dict, Depends(require_active_subscription)]
SubscriptionStatus = Annotated[SubscriptionInfo, Depends(get_subscription_status_for_user)]
