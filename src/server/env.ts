import "server-only";
import { z } from "zod";

/** Una variable vacía en `.env` (`GOOGLE_CLIENT_ID=`) cuenta como no definida. */
const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = z.preprocess(blankAsUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(blankAsUndefined, z.url().optional());

/** Prefijo de las claves de Redis cuando `REDIS_KEY_PREFIX` no está definida. */
export const DEFAULT_REDIS_KEY_PREFIX = "qr:";

/** Cada vista previa con sus claves: no se pisan entre sí ni tocan las de producción. */
function redisKeyPrefix({ explicit, preview, pullRequestId }: { explicit?: string; preview: boolean; pullRequestId?: string }): string {
  if (explicit) return explicit;
  if (!preview) return DEFAULT_REDIS_KEY_PREFIX;
  return pullRequestId ? `pr-${pullRequestId}:` : "preview:";
}

const schema = z
  .object({
    DATABASE_URL: z.url(),
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    REDIS_KEY_PREFIX: optional,
    ANON_COOKIE_SECRET: z.string().min(32),
    IP_HASH_SECRET: z.string().min(32),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: optionalUrl,
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    RESEND_API_KEY: optional,
    EMAIL_FROM: z.string().min(3).default("QwertyRank <noreply@qwertyrank.com>"),
    TURNSTILE_SECRET_KEY: optional,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
    /** Protege la tarea diaria (spec 5a §3.1): Vercel Cron la manda como `Authorization: Bearer …`. */
    CRON_SECRET: z.preprocess(blankAsUndefined, z.string().min(32).optional()),
    /** Sin ella, Sentry no se inicia (spec 5a §6.1). */
    SENTRY_DSN: optionalUrl,
    // Variables de sistema de Vercel (spec 5a §2.3).
    VERCEL_ENV: optional,
    VERCEL_URL: optional,
    VERCEL_BRANCH_URL: optional,
    VERCEL_GIT_PULL_REQUEST_ID: optional,
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
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.CRON_SECRET !== undefined, {
    message: "CRON_SECRET es obligatoria en producción: sin ella la tarea diaria no se ejecuta nunca",
    path: ["CRON_SECRET"],
  })
  .refine((env) => env.VERCEL_ENV !== "preview" || env.REDIS_KEY_PREFIX !== DEFAULT_REDIS_KEY_PREFIX, {
    message: `REDIS_KEY_PREFIX no puede ser "${DEFAULT_REDIS_KEY_PREFIX}" en una vista previa: compartiría las claves de Redis con producción`,
    path: ["REDIS_KEY_PREFIX"],
  })
  .transform((env, ctx) => {
    const preview = env.VERCEL_ENV === "preview";
    // En una vista previa, la URL estable de su rama: el enlace por email y las passkeys funcionan en ella.
    const baseURL = env.BETTER_AUTH_URL ?? (preview && env.VERCEL_BRANCH_URL ? `https://${env.VERCEL_BRANCH_URL}` : undefined);
    if (!baseURL) {
      ctx.addIssue({
        code: "custom",
        message: "BETTER_AUTH_URL es obligatoria (en las vistas previas de Vercel sale de VERCEL_BRANCH_URL)",
        path: ["BETTER_AUTH_URL"],
      });
      return z.NEVER;
    }
    return {
      ...env,
      BETTER_AUTH_URL: baseURL,
      REDIS_KEY_PREFIX: redisKeyPrefix({
        explicit: env.REDIS_KEY_PREFIX,
        preview,
        pullRequestId: env.VERCEL_GIT_PULL_REQUEST_ID,
      }),
      /** Orígenes que Better Auth acepta además del de `BETTER_AUTH_URL`: la URL única del despliegue de una vista previa. */
      AUTH_TRUSTED_ORIGINS: preview && env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : [],
    };
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
