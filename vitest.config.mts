import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// `server-only` lanza un error fuera de Next.js; en los tests se sustituye por su versión vacía.
const serverOnlyStub = fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": serverOnlyStub },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          // next-intl importa `next/navigation` sin extensión: que lo procese Vite para poder resolverlo.
          server: { deps: { inline: ["next-intl"] } },
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          setupFiles: ["./src/test/integration-env.ts"],
          globalSetup: ["./src/test/integration-global-setup.ts"],
          include: ["src/**/*.int.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
