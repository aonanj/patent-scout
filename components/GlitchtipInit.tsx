"use client";

import { useEffect } from "react";

/**
 * Lightweight GlitchTip initialization for the browser via the Sentry CDN.
 *
 * GlitchTip speaks the Sentry protocol, so we can reuse the vanilla Sentry
 * browser SDK without installing extra npm dependencies.
 */
export default function GlitchtipInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dsn =
      process.env.NEXT_PUBLIC_GLITCHTIP_DSN ||
      process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    const win = window as any;
    if (win.__glitchtip_inited || win.__sentry_inited || win.Sentry) return;

    const script = document.createElement("script");
    script.src = "https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => {
      const Sentry = win.Sentry;
      if (!Sentry) return;
      try {
        const traces = parseFloat(
          process.env.NEXT_PUBLIC_GLITCHTIP_TRACES_SAMPLE_RATE ||
            process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ||
            "0"
        );
        const profiles = parseFloat(
          process.env.NEXT_PUBLIC_GLITCHTIP_PROFILES_SAMPLE_RATE ||
            process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ||
            "0"
        );

        Sentry.init({
          dsn,
          environment:
            process.env.NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT ||
            process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
            "production",
          release:
            process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE ||
            process.env.NEXT_PUBLIC_SENTRY_RELEASE,
          integrations: [new Sentry.BrowserTracing()],
          tracesSampleRate: Number.isFinite(traces) ? traces : 0,
          profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,
          ignoreErrors: [/ResizeObserver loop limit exceeded/i],
        });
        win.__glitchtip_inited = true;
        win.__sentry_inited = true;
        try {
          Sentry.addBreadcrumb({ category: "nav", message: "app loaded" });
        } catch {
          // Breadcrumb is best-effort
        }
      } catch {
        // Silence initialization errors so the app keeps loading
      }
    };
    document.head.appendChild(script);
  }, []);

  return null;
}
