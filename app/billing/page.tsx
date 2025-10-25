"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SubscriptionStatus from "@/components/billing/SubscriptionStatus";
import PricingPlans from "@/components/billing/PricingPlans";

type SubscriptionInfo = {
  has_active: boolean;
  tier: string | null;
  status: string | null;
  days_in_tier: number | null;
  needs_migration: boolean;
  period_end: string | null;
  stripe_customer_id: string | null;
};

type PricePlan = {
  stripe_price_id: string;
  tier: string;
  name: string;
  amount_cents: number;
  currency: string;
  interval: string;
  interval_count: number;
  description: string | null;
  is_active: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function BillingContent() {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently, user } = useAuth0();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<PricePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSubscriptionStatus = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`${API_BASE}/api/payment/subscription-status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load subscription: ${response.status}`);
      }

      const data = await response.json();
      setSubscription(data);
    } catch (err: any) {
      console.error("Error loading subscription:", err);
      setError(err.message || "Failed to load subscription status");
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  const loadPricingPlans = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/payment/pricing-plans`);

      if (!response.ok) {
        throw new Error(`Failed to load pricing: ${response.status}`);
      }

      const data = await response.json();
      setPlans(data.plans || []);
    } catch (err: any) {
      console.error("Error loading pricing:", err);
      setError(err.message || "Failed to load pricing plans");
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        isAuthenticated ? loadSubscriptionStatus() : Promise.resolve(),
        loadPricingPlans(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadSubscriptionStatus, loadPricingPlans]);

  useEffect(() => {
    if (!isLoading) {
      loadData();
    }
  }, [isLoading, loadData]);

  // Handle successful checkout
  useEffect(() => {
    if (sessionId && isAuthenticated) {
      setSuccessMessage("Subscription created successfully! Processing payment...");
      // Reload subscription status after a short delay (webhook might take a moment)
      const timer = setTimeout(() => {
        loadSubscriptionStatus();
        setSuccessMessage("Subscription activated successfully!");
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [sessionId, isAuthenticated, loadSubscriptionStatus]);

  const handleSubscribe = useCallback(
    async (priceId: string) => {
      if (!isAuthenticated) {
        loginWithRedirect();
        return;
      }

      if (!user?.email) {
        alert("Email not found in user profile. Please log out and log in again.");
        return;
      }

      try {
        const token = await getAccessTokenSilently();
        const response = await fetch(`${API_BASE}/api/payment/create-checkout-session`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            price_id: priceId,
            email: user.email,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const { url } = await response.json();
        window.location.href = url;
      } catch (err: any) {
        console.error("Error creating checkout session:", err);
        alert(err.message || "Failed to start checkout process");
      }
    },
    [isAuthenticated, getAccessTokenSilently, loginWithRedirect, user]
  );

  const handleManageSubscription = useCallback(async () => {
    if (!isAuthenticated) {
      loginWithRedirect();
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`${API_BASE}/api/payment/create-portal-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err: any) {
      console.error("Error opening customer portal:", err);
      alert(err.message || "Failed to open customer portal");
    }
  }, [isAuthenticated, getAccessTokenSilently, loginWithRedirect]);

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[#eaf6ff] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-500 border-r-transparent"></div>
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#102A43' }}>Sign in to Continue</h2>
          <p className="text-slate-600 mb-6">
            Please log in to view your subscription or purchase a plan.
          </p>
          <button
            onClick={() => loginWithRedirect()}
            className="w-full px-4 py-3 bg-sky-500 text-white rounded-lg hover:bg-sky-600 font-semibold transition-colors"
          >
            Log in / Sign up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eaf6ff]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#102A43' }}>Billing & Subscription</h1>
          <p className="mt-2 text-slate-600">Manage your Patent Scout subscription</p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={loadData}
              className="mt-2 text-sm text-red-700 underline hover:text-red-900"
            >
              Try again
            </button>
          </div>
        )}

        {/* Subscription Status Section */}
        {subscription?.has_active ? (
          <div className="mb-8">
            <SubscriptionStatus
              subscription={subscription}
              onManage={handleManageSubscription}
            />
          </div>
        ) : (
          /* Pricing Plans Section */
          <div className="mb-8">
            <PricingPlans plans={plans} onSubscribe={handleSubscribe} />
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-12 p-6 bg-white rounded-lg border border-slate-200">
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#102A43' }}>Billing & Technical Support</h3>
          <p className="text-sm text-slate-600 mb-4">
            For subscription, billing, and other technical issues, please contact {" "}
            <a href="mailto:support@phaethon.llc" className="text-sky-600 hover:underline">
              support@phaethon.llc
            </a>.
          </p>
          <p className="text-sm text-slate-600 mb-4">
            For urgent issues, we are also available via phone and text at (949) 328-0878. Please include your account email in your message. Phone and text support require an active subscription. 
          </p>
          <div className="flex gap-4" style={{ textAlign: "center", fontSize: "12px", justifyContent: "center"}}>
            <a>2025 © Phaethon Order LLC</a> | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">phaethonorder.com</a> | <a href="/help" className="text-blue-400 hover:underline">Help</a> | <a href="/docs" className="text-blue-400 hover:underline">Legal</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#eaf6ff] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-500 border-r-transparent"></div>
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
