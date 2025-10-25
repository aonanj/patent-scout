"use client";

import { useMemo } from "react";

type SubscriptionInfo = {
  has_active: boolean;
  tier: string | null;
  status: string | null;
  days_in_tier: number | null;
  needs_migration: boolean;
  period_end: string | null;
  stripe_customer_id: string | null;
};

type SubscriptionStatusProps = {
  subscription: SubscriptionInfo;
  onManage: () => void;
};

export default function SubscriptionStatus({ subscription, onManage }: SubscriptionStatusProps) {
  const tierDisplay = useMemo(() => {
    if (subscription.tier === "beta_tester") return "Beta Tester";
    if (subscription.tier === "user") return "User";
    return subscription.tier || "Unknown";
  }, [subscription.tier]);

  const statusDisplay = useMemo(() => {
    if (!subscription.status) return "Unknown";

    const statusMap: Record<string, string> = {
      active: "Active",
      trialing: "Trial",
      past_due: "Past Due",
      canceled: "Canceled",
      incomplete: "Incomplete",
      incomplete_expired: "Expired",
      unpaid: "Unpaid",
    };

    return statusMap[subscription.status] || subscription.status;
  }, [subscription.status]);

  const statusColor = useMemo(() => {
    if (!subscription.status) return "slate";

    const colorMap: Record<string, string> = {
      active: "green",
      trialing: "blue",
      past_due: "orange",
      canceled: "red",
      incomplete: "yellow",
      incomplete_expired: "red",
      unpaid: "red",
    };

    return colorMap[subscription.status] || "slate";
  }, [subscription.status]);

  const renewalDate = useMemo(() => {
    if (!subscription.period_end) return null;

    try {
      const date = new Date(subscription.period_end);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return subscription.period_end;
    }
  }, [subscription.period_end]);

  const betaDaysRemaining = useMemo(() => {
    if (subscription.tier !== "beta_tester" || !subscription.days_in_tier) return null;
    return Math.max(0, 90 - subscription.days_in_tier);
  }, [subscription.tier, subscription.days_in_tier]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#3A506B] px-6 py-4 border-b border-slate-200">
        <h2 className="text-xl font-bold" style={{ color: '#FFFFFF' }}>Your Subscription</h2>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Plan */}
          <div>
            <div className="text-sm text-slate-500 mb-1 font-semibold" style={{ textDecoration: "underline" }}>Plan</div>
            <div className="text-lg font-semibold" style={{ color: '#102A43' }}>{tierDisplay}</div>
          </div>

          {/* Status */}
          <div>
            <div className="text-sm text-slate-500 mb-1 font-semibold" style={{ textDecoration: "underline" }}>Status</div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  statusColor === "green"
                    ? "bg-green-100 text-green-800"
                    : statusColor === "blue"
                    ? "bg-blue-100 text-blue-800"
                    : statusColor === "orange"
                    ? "bg-orange-100 text-orange-800"
                    : statusColor === "red"
                    ? "bg-red-100 text-red-800"
                    : statusColor === "yellow"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {statusDisplay}
              </span>
            </div>
          </div>

          {/* Renewal Date */}
          {renewalDate && (
            <div>
              <div className="text-sm text-slate-500 mb-1 font-semibold" style={{ textDecoration: "underline" }}>
                {subscription.status === "canceled" ? "Access Until" : "Renews On"}
              </div>
              <div className="text-lg font-semibold" style={{ color: '#102A43' }}>{renewalDate}</div>
            </div>
          )}

          {/* Days in Tier (for beta testers) */}
          {subscription.tier === "beta_tester" && subscription.days_in_tier !== null && (
            <div>
              <div className="text-sm text-slate-500 mb-1">Beta Period</div>
              <div className="text-lg font-semibold" style={{ color: '#102A43' }}>
                {subscription.days_in_tier} days elapsed
              </div>
            </div>
          )}
        </div>

        {/* Beta Tester Migration Warning */}
        {subscription.needs_migration && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-orange-900 mb-1">
                  Beta Period Ending Soon
                </h4>
                <p className="text-sm text-orange-800">
                  Your 90-day beta period has ended. Your subscription will automatically migrate to
                  the User tier ($189/month) at your next renewal. Update your subscription below
                  if you'd like to make changes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Beta Days Remaining Warning */}
        {betaDaysRemaining !== null && betaDaysRemaining <= 14 && betaDaysRemaining > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-yellow-900 mb-1">
                  Beta Period Expiring Soon
                </h4>
                <p className="text-sm text-yellow-800">
                  You have {betaDaysRemaining} days remaining in your beta period. After that, your
                  subscription will transition to the User tier at $189/month.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Features List */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <h4 className="text-sm font-semibold mb-3" style={{ color: '#102A43' }}>Your Plan Includes:</h4>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-sm text-slate-700">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Unlimited patent searches</span>
            </li>
            <li className="flex items-start gap-2 text-sm text-slate-700">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Semantic search & AI-powered insights</span>
            </li>
            <li className="flex items-start gap-2 text-sm text-slate-700">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>CSV & PDF exports</span>
            </li>
            <li className="flex items-start gap-2 text-sm text-slate-700">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Saved queries & email alerts</span>
            </li>
            <li className="flex items-start gap-2 text-sm text-slate-700">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Whitespace analysis & trend visualization</span>
            </li>
          </ul>
        </div>

        {/* Manage Subscription Button */}
        <div className="flex justify-center">
          <button
            onClick={onManage}
            className="px-6 py-3 bg-sky-500 text-white rounded-lg hover:bg-sky-600 font-semibold transition-colors hover:underline"
          >
            Manage Subscription
          </button>
        </div>

        <p className="mt-3 text-xs text-center text-slate-500">
          Update payment method, view billing history, or cancel your subscription.
        </p>
      </div>
    </div>
  );
}
