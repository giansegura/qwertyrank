import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { INDEXABLE } from "./src/lib/site";

const withNextIntl = createNextIntlPlugin({
  // Mensajes ICU compilados en el build: el cliente no carga el parser de ICU (spec 5b §7.1).
  experimental: { messages: { path: "./messages", format: "json", locales: "infer", precompile: true } },
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Solo HTTPS durante dos años; sin `preload`, que es difícil de deshacer (spec 5a §2.4).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Durante la beta no se indexa nada (spec 5a §5).
          ...(INDEXABLE ? [] : [{ key: "X-Robots-Tag", value: "noindex" }]),
        ],
      },
      // El panel no se indexa nunca (spec 4a §5), tampoco su 404.
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
