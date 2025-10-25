// This file configures the initialization of GlitchTip (Sentry-compatible) for edge features
// (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.GLITCHTIP_DSN ||
  process.env.NEXT_PUBLIC_GLITCHTIP_DSN ||
  process.env.SENTRY_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const traces = Number(
    process.env.GLITCHTIP_TRACES_SAMPLE_RATE ||
      process.env.SENTRY_TRACES_SAMPLE_RATE ||
      "0"
  );
  const profiles = Number(
    process.env.GLITCHTIP_PROFILES_SAMPLE_RATE ||
      process.env.SENTRY_PROFILES_SAMPLE_RATE ||
      "0"
  );

  Sentry.init({
    dsn,
    environment:
      process.env.GLITCHTIP_ENVIRONMENT ||
      process.env.SENTRY_ENVIRONMENT ||
      "production",
    release: process.env.GLITCHTIP_RELEASE || process.env.SENTRY_RELEASE,

    tracesSampleRate: Number.isFinite(traces) ? traces : 0,
    profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,
    enableLogs: true,
    sendDefaultPii: true,
  });
}
