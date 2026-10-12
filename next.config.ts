import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / Partial Prerendering are intentionally OFF.
  //
  // Every route in this platform is request-time: layouts and pages read the
  // session cookie, and data comes from Postgres (matches, scores, boards that
  // change second to second). A prerendered static shell would be stale the
  // moment a Game Master starts a round, and forcing those segments static
  // fails the build — client segments using `usePathname()`/`useRouter()` and
  // route handlers calling `cookies()` cannot be prerendered.
  //
  // With this disabled, Next.js uses classic App Router semantics: dynamic
  // routes render on demand and cookie-reading handlers stay dynamic.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
