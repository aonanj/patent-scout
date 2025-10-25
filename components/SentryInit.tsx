"use client";

import { useEffect } from "react";

/**
 * Lightweight Sentry initialization for the browser via CDN.
 *
 * This avoids adding a package dependency when the repo doesn't include
 * a package.json. If NEXT_PUBLIC_SENTRY_DSN is set, we load the Sentry
 * browser SDK and initialize it with optional performance sampling.
 */
export default function SentryInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    // Prevent double init on hot reloads
    if ((window as any).__sentry_inited || (window as any).Sentry) return;

    const script = document.createElement("script");
    script.src = "https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => {
      const Sentry = (window as any).Sentry;
      if (!Sentry) return;
      try {
        const traces = parseFloat(
          process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0"
        );
        const profiles = parseFloat(
          process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE || "0"
        );

        Sentry.init({
          dsn,
          environment:
            process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
          release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
          integrations: [new Sentry.BrowserTracing()],
          tracesSampleRate: Number.isFinite(traces) ? traces : 0,
          profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,
          ignoreErrors: [/ResizeObserver loop limit exceeded/i],
        });
        (window as any).__sentry_inited = true;
        // Optional: mark page view
        try {
          Sentry.addBreadcrumb({ category: "nav", message: "app loaded" });
        } catch {}
      } catch {}
    };
    document.head.appendChild(script);
  }, []);

  return null;
}
