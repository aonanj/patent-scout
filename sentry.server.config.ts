// This file configures the initialization of GlitchTip (Sentry-compatible) on the server.
// The config you add here will be used whenever the server handles a request.
// https://glitchtip.com/docs/platforms/javascript/nextjs

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

    // Define how likely traces and profiles are sampled.
    tracesSampleRate: Number.isFinite(traces) ? traces : 0,
    profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,

    enableLogs: true,

    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
  });
}
