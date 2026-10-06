import "server-only";
import { z } from "zod";

/** Una variable vacía en `.env` (`GOOGLE_CLIENT_ID=`) cuenta como no definida. */
const optional = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

const schema = z
  .object({
    DATABASE_URL: z.url(),
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    REDIS_KEY_PREFIX: z.string().min(1).default("qr:"),
    ANON_COOKIE_SECRET: z.string().min(32),
    IP_HASH_SECRET: z.string().min(32),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    RESEND_API_KEY: optional,
    EMAIL_FROM: z.string().min(3).default("QwertyRank <noreply@qwertyrank.com>"),
    TURNSTILE_SECRET_KEY: optional,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
    VERCEL_ENV: optional,
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.RESEND_API_KEY !== undefined, {
    message: "RESEND_API_KEY es obligatoria en producción: sin ella los emails no salen",
    path: ["RESEND_API_KEY"],
  })
  .refine((env) => (env.TURNSTILE_SECRET_KEY === undefined) === (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === undefined), {
    message: "TURNSTILE_SECRET_KEY y NEXT_PUBLIC_TURNSTILE_SITE_KEY van juntas: con una sola, nadie podría empezar una partida Ranked",
    path: ["TURNSTILE_SECRET_KEY"],
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.TURNSTILE_SECRET_KEY !== undefined, {
    message: "Las claves de Turnstile son obligatorias en producción: sin ellas no se pide el pase humano",
    path: ["TURNSTILE_SECRET_KEY"],
  });

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  return schema.parse(raw);
}

let cached: ServerEnv | null = null;

/** Variables de entorno del servidor, validadas la primera vez que se piden (no durante el build). */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
