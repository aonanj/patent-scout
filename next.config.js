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



// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  module.exports,
  {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "phaethon-order-llc",
    project: "python-fastapi",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    // tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
);
