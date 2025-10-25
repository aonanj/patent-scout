// GlitchTip (Sentry-compatible) initialization for the browser runtime.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.NEXT_PUBLIC_GLITCHTIP_DSN ||
  process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const traces = Number(
    process.env.NEXT_PUBLIC_GLITCHTIP_TRACES_SAMPLE_RATE ||
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ||
      "0"
  );
  const profiles = Number(
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
    integrations: [Sentry.replayIntegration()],
    tracesSampleRate: Number.isFinite(traces) ? traces : 0,
    profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
