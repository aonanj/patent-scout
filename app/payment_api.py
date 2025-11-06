"""Payment and subscription management API endpoints.

This module provides endpoints for:
- Creating Stripe Checkout sessions
- Managing subscriptions via customer portal
- Checking subscription status
- Listing available pricing plans
"""

from __future__ import annotations

import os
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_conn
from app.subscription_middleware import get_subscription_info
from infrastructure.logger import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/payment", tags=["payment"])

# Type aliases for dependency injection
Conn = Annotated[AsyncConnection, Depends(get_conn)]
User = Annotated[dict, Depends(get_current_user)]


# ============================================================================
# Request/Response Models
# ============================================================================


class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a Stripe Checkout session."""

    price_id: str
    email: str  # User's email address (from Auth0 user profile)
    success_url: str | None = None
    cancel_url: str | None = None


class CreateCheckoutSessionResponse(BaseModel):
    """Response containing Stripe Checkout session URL."""

    session_id: str
    url: str


class CustomerPortalResponse(BaseModel):
    """Response containing Stripe customer portal URL."""

    url: str


class SubscriptionStatusResponse(BaseModel):
    """User's subscription status details."""

    has_active: bool
    tier: str | None = None
    status: str | None = None
    days_in_tier: int | None = None
    needs_migration: bool = False
    period_end: str | None = None
    stripe_customer_id: str | None = None


class PricePlan(BaseModel):
    """Pricing plan details."""

    stripe_price_id: str
    tier: str
    name: str
    amount_cents: int
    currency: str
    interval: str
    interval_count: int
    description: str | None = None
    is_active: bool


class PricingPlansResponse(BaseModel):
    """List of available pricing plans."""

    plans: list[PricePlan]


# ============================================================================
# Helper Functions
# ============================================================================


async def get_or_create_stripe_customer(
    conn: AsyncConnection, user_id: str, email: str
) -> str:
    """Get existing Stripe customer ID or create new customer.

    Args:
        conn: Database connection
        user_id: Auth0 user ID
        email: User's email address

    Returns:
        Stripe customer ID

    Raises:
        HTTPException: If customer creation fails
    """
    # Check if customer already exists in database
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT stripe_customer_id FROM stripe_customer WHERE user_id = %s",
            [user_id],
        )
        result = await cur.fetchone()

        if result:
            return result["stripe_customer_id"]

    # Create new Stripe customer
    try:
        customer = stripe.Customer.create(
            email=email,
            metadata={"user_id": user_id},
        )

        # Store in database
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO stripe_customer (user_id, stripe_customer_id, email) "
                "VALUES (%s, %s, %s) "
                "ON CONFLICT (user_id) DO UPDATE "
                "SET stripe_customer_id = EXCLUDED.stripe_customer_id, "
                "    email = EXCLUDED.email, "
                "    updated_at = NOW()",
                [user_id, customer.id, email],
            )

        logger.info(f"Created Stripe customer {customer.id} for user {user_id}")
        return customer.id

    except stripe.StripeError as e:
        logger.error(f"Failed to create Stripe customer: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create customer: {str(e)}"
        ) from e


# ============================================================================
# API Endpoints
# ============================================================================


@router.post("/create-checkout-session", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    req: CreateCheckoutSessionRequest, conn: Conn, user: User
) -> CreateCheckoutSessionResponse:
    """Create a Stripe Checkout session for subscription purchase.

    This endpoint creates a Stripe Checkout session that redirects the user
    to Stripe's hosted payment page. After successful payment, the webhook
    will create the subscription in the database.

    Args:
        req: Checkout session request with price_id and redirect URLs
        conn: Database connection (injected)
        user: Authenticated user (injected)

    Returns:
        Checkout session ID and URL to redirect user

    Raises:
        HTTPException: If user missing required claims or Stripe API fails
    """
    user_id = user.get("sub")

    if not user_id:
        raise HTTPException(status_code=400, detail="User missing 'sub' claim")

    if not req.email or not req.email.strip():
        raise HTTPException(status_code=400, detail="Email is required")

    # Get or create Stripe customer
    stripe_customer_id = await get_or_create_stripe_customer(conn, user_id, req.email)

    # Determine frontend URL for redirects
    frontend_url = os.getenv("FRONTEND_URL", "https://patent-scout.com")
    success_url = req.success_url or f"{frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = req.cancel_url or f"{frontend_url}/billing"

    try:
        # Create Stripe Checkout session
        session = stripe.checkout.Session.create(
            customer=stripe_customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": req.price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": user_id,  # Used by webhook to link subscription
            },
            subscription_data={
                "metadata": {
                    "user_id": user_id,
                }
            },
        )

        logger.info(
            f"Created checkout session {session.id} for user {user_id} "
            f"with price {req.price_id}"
        )

        if not session.url:
            raise HTTPException(
                status_code=500, detail="Checkout session created but URL is missing"
            )

        return CreateCheckoutSessionResponse(session_id=session.id, url=session.url)

    except stripe.InvalidRequestError as e:
        logger.error(f"Invalid checkout session request: {e}")
        raise HTTPException(
            status_code=400, detail=f"Invalid price ID or request: {str(e)}"
        ) from e
    except stripe.StripeError as e:
        logger.error(f"Stripe error creating checkout session: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to create checkout session"
        ) from e


@router.post("/create-portal-session", response_model=CustomerPortalResponse)
async def create_portal_session(conn: Conn, user: User) -> CustomerPortalResponse:
    """Create a Stripe customer portal session for subscription management.

    The customer portal allows users to:
    - View subscription details
    - Update payment method
    - Cancel subscription
    - View billing history

    Args:
        conn: Database connection (injected)
        user: Authenticated user (injected)

    Returns:
        Customer portal URL to redirect user

    Raises:
        HTTPException: If user has no Stripe customer or API fails
    """
    user_id = user.get("sub")

    if not user_id:
        raise HTTPException(status_code=400, detail="User missing 'sub' claim")

    # Get Stripe customer ID from database
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT stripe_customer_id FROM stripe_customer WHERE user_id = %s",
            [user_id],
        )
        result = await cur.fetchone()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No customer record found. Please subscribe first.",
        )

    stripe_customer_id = result["stripe_customer_id"]

    # Determine return URL
    frontend_url = os.getenv("FRONTEND_URL", "https://patent-scout.com")
    return_url = f"{frontend_url}/billing"

    try:
        # Create customer portal session
        session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=return_url,
        )

        logger.info(f"Created portal session for user {user_id}")

        return CustomerPortalResponse(url=session.url)

    except stripe.StripeError as e:
        logger.error(f"Failed to create portal session: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to create customer portal session"
        ) from e


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    conn: Conn, user: User
) -> SubscriptionStatusResponse:
    """Get current user's subscription status.

    Returns detailed subscription information including tier, status,
    and whether beta testers need migration.

    Args:
        conn: Database connection (injected)
        user: Authenticated user (injected)

    Returns:
        Subscription status details

    Raises:
        HTTPException: If user missing 'sub' claim
    """
    user_id = user.get("sub")

    if not user_id:
        raise HTTPException(status_code=400, detail="User missing 'sub' claim")

    # Get subscription info using middleware helper
    sub_info = await get_subscription_info(user_id, conn)

    # Get Stripe customer ID if exists
    stripe_customer_id = None
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT stripe_customer_id FROM stripe_customer WHERE user_id = %s",
            [user_id],
        )
        result = await cur.fetchone()
        if result:
            stripe_customer_id = result["stripe_customer_id"]

    return SubscriptionStatusResponse(
        has_active=sub_info.has_active,
        tier=sub_info.tier,
        status=sub_info.status,
        days_in_tier=sub_info.days_in_tier,
        needs_migration=sub_info.needs_migration,
        period_end=sub_info.period_end,
        stripe_customer_id=stripe_customer_id,
    )


@router.get("/pricing-plans", response_model=PricingPlansResponse)
async def get_pricing_plans(conn: Conn) -> PricingPlansResponse:
    """Get list of available subscription pricing plans.

    Returns all active pricing plans from the database. Does not require
    authentication so pricing can be shown to anonymous users.

    Args:
        conn: Database connection (injected)

    Returns:
        List of available pricing plans
    """
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT
                stripe_price_id,
                tier,
                name,
                amount_cents,
                currency,
                interval,
                interval_count,
                description,
                is_active
            FROM price_plan
            WHERE is_active = true
            ORDER BY
                CASE tier
                    WHEN 'beta_tester' THEN 1
                    WHEN 'user' THEN 2
                END,
                amount_cents ASC
            """
        )
        rows = await cur.fetchall()

    plans = [PricePlan(**row) for row in rows]

    return PricingPlansResponse(plans=plans)


@router.post("/cancel-subscription")
async def cancel_subscription(conn: Conn, user: User) -> dict[str, str]:
    """Cancel user's active subscription.

    Cancels the subscription at the end of the current billing period.
    User retains access until period_end.

    Args:
        conn: Database connection (injected)
        user: Authenticated user (injected)

    Returns:
        Success message

    Raises:
        HTTPException: If no active subscription found or cancellation fails
    """
    user_id = user.get("sub")

    if not user_id:
        raise HTTPException(status_code=400, detail="User missing 'sub' claim")

    # Get active subscription
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT stripe_subscription_id
            FROM subscription
            WHERE user_id = %s
              AND status IN ('active', 'trialing')
            ORDER BY current_period_end DESC
            LIMIT 1
            """,
            [user_id],
        )
        result = await cur.fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="No active subscription found")

    stripe_subscription_id = result["stripe_subscription_id"]

    try:
        # Cancel subscription at period end (don't cancel immediately)
        stripe.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=True,
        )

        logger.info(f"Scheduled cancellation for subscription {stripe_subscription_id}")

        return {
            "message": "Subscription will be canceled at the end of the billing period"
        }

    except stripe.StripeError as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to cancel subscription"
        ) from e


@router.post("/reactivate-subscription")
async def reactivate_subscription(conn: Conn, user: User) -> dict[str, str]:
    """Reactivate a subscription that was scheduled for cancellation.

    Removes the cancel_at_period_end flag, allowing the subscription to renew.

    Args:
        conn: Database connection (injected)
        user: Authenticated user (injected)

    Returns:
        Success message

    Raises:
        HTTPException: If no subscription found or reactivation fails
    """
    user_id = user.get("sub")

    if not user_id:
        raise HTTPException(status_code=400, detail="User missing 'sub' claim")

    # Get subscription scheduled for cancellation
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            """
            SELECT stripe_subscription_id
            FROM subscription
            WHERE user_id = %s
              AND status IN ('active', 'trialing')
              AND cancel_at_period_end = true
            LIMIT 1
            """,
            [user_id],
        )
        result = await cur.fetchone()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No subscription scheduled for cancellation found",
        )

    stripe_subscription_id = result["stripe_subscription_id"]

    try:
        # Remove cancellation flag
        stripe.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=False,
        )

        logger.info(f"Reactivated subscription {stripe_subscription_id}")

        return {"message": "Subscription reactivated successfully"}

    except stripe.StripeError as e:
        logger.error(f"Failed to reactivate subscription: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to reactivate subscription"
        ) from e
