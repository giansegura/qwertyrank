import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().min(1).default("qr:"),
  ANON_COOKIE_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Variables de entorno del servidor, validadas la primera vez que se piden (no durante el build). */
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
