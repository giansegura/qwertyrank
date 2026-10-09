import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { INDEXABLE } from "./src/lib/site";

const withNextIntl = createNextIntlPlugin({
  // ICU messages compiled at build time: the client doesn't load the ICU parser (spec 5b §7.1).
  experimental: { messages: { path: "./messages", format: "json", locales: "infer", precompile: true } },
});

/** Guides are MDX imported by their page (spec 5c §3): never routed, so no `pageExtensions` change. */
const withMDX = createMDX({});

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // HTTPS only for two years; no `preload`, which is hard to undo (spec 5a §2.4).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Nothing is indexed during the beta (spec 5a §5).
          ...(INDEXABLE ? [] : [{ key: "X-Robots-Tag", value: "noindex" }]),
        ],
      },
      // The panel is never indexed (spec 4a §5), nor is its 404.
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default withNextIntl(withMDX(nextConfig));
