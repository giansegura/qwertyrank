import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same rules as Next.js: .env.local in development, .env.test with NODE_ENV=test.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Neon: migrations go through the direct connection; the app uses the pooler one (DATABASE_URL).
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
