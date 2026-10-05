import { loadEnvConfig } from "@next/env";

// Con NODE_ENV=test, @next/env carga .env.test (y nunca .env.local).
loadEnvConfig(process.cwd());
