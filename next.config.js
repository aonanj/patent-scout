/**
 * Next.js configuration with optional Sentry support.
 * If @sentry/nextjs is not installed, this falls back to the base config.
 */

/** @type {import('next').NextConfig} */
const baseConfig = {
  experimental: {
    // Enable instrumentation hook (app/instrumentation.ts)
    instrumentationHook: true,
  },
};

try {
  // Only wrap when the package is available
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  const { withSentryConfig } = require("@sentry/nextjs");
  const sentryWebpackPluginOptions = {
    // Suppress noisy logs during build
    silent: true,
  };
  module.exports = withSentryConfig(baseConfig, sentryWebpackPluginOptions);
} catch (err) {
  // @sentry/nextjs not installed; use base config
  module.exports = baseConfig;
}

