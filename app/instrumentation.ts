/**
 * Optional GlitchTip (Sentry-compatible) initialization for Next.js (server/runtime).
 * This file is executed by Next when `experimental.instrumentationHook` is enabled.
 * It safely no-ops if @sentry/nextjs is not installed.
 */

const fromEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
};

export async function register() {
  const dsn = fromEnv(
    "GLITCHTIP_DSN",
    "NEXT_PUBLIC_GLITCHTIP_DSN",
    "SENTRY_DSN",
    "NEXT_PUBLIC_SENTRY_DSN"
  );
  if (!dsn) return;

  try {
    const moduleId: string = "@sentry/nextjs";
    const Sentry = await import(moduleId).catch(() => null);
    if (!Sentry) return;
    const traces = Number(
      fromEnv(
        "GLITCHTIP_TRACES_SAMPLE_RATE",
        "NEXT_PUBLIC_GLITCHTIP_TRACES_SAMPLE_RATE",
        "SENTRY_TRACES_SAMPLE_RATE",
        "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE"
      ) || "0"
    );
    const profiles = Number(
      fromEnv(
        "GLITCHTIP_PROFILES_SAMPLE_RATE",
        "NEXT_PUBLIC_GLITCHTIP_PROFILES_SAMPLE_RATE",
        "SENTRY_PROFILES_SAMPLE_RATE",
        "NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE"
      ) || "0"
    );

    Sentry.init({
      dsn,
      environment:
        fromEnv(
          "GLITCHTIP_ENVIRONMENT",
          "NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT",
          "SENTRY_ENVIRONMENT",
          "NEXT_PUBLIC_SENTRY_ENVIRONMENT"
        ) || "production",
      release: fromEnv(
        "GLITCHTIP_RELEASE",
        "NEXT_PUBLIC_GLITCHTIP_RELEASE",
        "SENTRY_RELEASE",
        "NEXT_PUBLIC_SENTRY_RELEASE"
      ),
      tracesSampleRate: Number.isFinite(traces) ? traces : 0,
      profilesSampleRate: Number.isFinite(profiles) ? profiles : 0,
    });
  } catch {
    // @sentry/nextjs not installed; ignore
  }
}
