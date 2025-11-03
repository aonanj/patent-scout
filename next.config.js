/**
 * Next.js configuration with optional GlitchTip (Sentry-compatible) support.
 * If @sentry/nextjs is not installed, this falls back to the base config.
 */

/** @type {import('next').NextConfig} */
const baseConfig = {};

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
  const sentryOptions = {
    org: glitchtipOrg,
    project: glitchtipProject,
    authToken: glitchtipAuthToken,
    sentryUrl: glitchtipUrl,
    // Delete source maps after upload so they do not ship with the client bundle
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,
  };
  module.exports = withSentryConfig(baseConfig, sentryOptions);
} catch (err) {
  // @sentry/nextjs not installed; use base config
  module.exports = baseConfig;
}
