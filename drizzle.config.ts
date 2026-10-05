import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Mismas reglas que Next.js: .env.local en desarrollo, .env.test con NODE_ENV=test.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Neon: las migraciones van por la conexión directa; la app usa la del pooler (DATABASE_URL).
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
