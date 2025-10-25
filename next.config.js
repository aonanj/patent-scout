/**
 * Next.js configuration with optional GlitchTip (Sentry-compatible) support.
 * If @sentry/nextjs is not installed, this falls back to the base config.
 */

/** @type {import('next').NextConfig} */
const baseConfig = {
  experimental: {
    // Enable instrumentation hook (app/instrumentation.ts)
    instrumentationHook: true,
  },
  sentry: {
    // Ensure source maps are removed from the client bundle and only uploaded to GlitchTip
    hideSourceMaps: true,
    widenClientFileUpload: true,
  },
};

const glitchtipUrl = process.env.GLITCHTIP_URL || process.env.SENTRY_URL;
const glitchtipOrg =
  process.env.GLITCHTIP_ORG || process.env.SENTRY_ORG || "phaethon-order-llc";
const glitchtipProject =
  process.env.GLITCHTIP_PROJECT ||
  process.env.SENTRY_PROJECT ||
  "python-fastapi";
const glitchtipAuthToken =
  process.env.GLITCHTIP_AUTH_TOKEN || process.env.SENTRY_AUTH_TOKEN;

try {
  // Only wrap when the package is available
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  const { withSentryConfig } = require("@sentry/nextjs");
  const sentryWebpackPluginOptions = {
    org: glitchtipOrg,
    project: glitchtipProject,
    authToken: glitchtipAuthToken,
    url: glitchtipUrl,
    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,
    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  };
  module.exports = withSentryConfig(baseConfig, sentryWebpackPluginOptions);
} catch (err) {
  // @sentry/nextjs not installed; use base config
  module.exports = baseConfig;
}
