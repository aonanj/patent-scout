/**
 * Optional Sentry initialization for Next.js (server/runtime).
 * This file is executed by Next when `experimental.instrumentationHook` is enabled.
 * It safely no-ops if @sentry/nextjs is not installed.
 */

export async function register() {
  const hasDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!hasDsn) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    const traces = Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ||
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ||
        "0"
    );
    const profiles = Number(
      process.env.SENTRY_PROFILES_SAMPLE_RATE ||
        process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ||
        "0"
    );

    Sentry.init({
      dsn: (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)!,
      environment:
        process.env.SENTRY_ENVIRONMENT ||
        process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
        "production",
      release:
        process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      tracesSampleRate: Number.isFinite(traces) ? traces : 0,
      profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,
    });
  } catch {
    // @sentry/nextjs not installed; ignore
  }
}

