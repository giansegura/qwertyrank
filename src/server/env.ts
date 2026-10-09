import "server-only";
import { z } from "zod";
import { anticheatConfigJson, DEV_ANTICHEAT_CONFIG, sameAnticheatConfig } from "./anticheat/config";

/** An empty variable in `.env` (`GOOGLE_CLIENT_ID=`) counts as undefined. */
const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = z.preprocess(blankAsUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(blankAsUndefined, z.url().optional());

/** Redis key prefix when `REDIS_KEY_PREFIX` is not defined. */
export const DEFAULT_REDIS_KEY_PREFIX = "qr:";

/** Each preview deployment with its own keys: they don't clash with each other or touch production's. */
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
    /** Protects the daily job (spec 5a §3.1): Vercel Cron sends it as `Authorization: Bearer …`. */
    CRON_SECRET: z.preprocess(blankAsUndefined, z.string().min(32).optional()),
    /** Without it, Sentry does not start (spec 5a §6.1). */
    SENTRY_DSN: optionalUrl,
    /** Anti-cheat thresholds as JSON (`src/server/anticheat/config.ts`). Without it, the development ones. */
    ANTICHEAT_CONFIG: z.preprocess(blankAsUndefined, anticheatConfigJson.optional()),
    // Vercel system variables (spec 5a §2.3).
    VERCEL_ENV: optional,
    VERCEL_URL: optional,
    VERCEL_BRANCH_URL: optional,
    VERCEL_GIT_PULL_REQUEST_ID: optional,
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.RESEND_API_KEY !== undefined, {
    message: "RESEND_API_KEY is required in production: without it no emails are sent",
    path: ["RESEND_API_KEY"],
  })
  .refine((env) => (env.TURNSTILE_SECRET_KEY === undefined) === (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === undefined), {
    message: "TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY go together: with only one, nobody could start a Ranked game",
    path: ["TURNSTILE_SECRET_KEY"],
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.TURNSTILE_SECRET_KEY !== undefined, {
    message: "The Turnstile keys are required in production: without them the human pass is not requested",
    path: ["TURNSTILE_SECRET_KEY"],
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.CRON_SECRET !== undefined, {
    message: "CRON_SECRET is required in production: without it the daily job never runs",
    path: ["CRON_SECRET"],
  })
  .refine((env) => env.VERCEL_ENV !== "production" || env.ANTICHEAT_CONFIG !== undefined, {
    message: "ANTICHEAT_CONFIG is required in production: the development thresholds are in the code, which is public",
    path: ["ANTICHEAT_CONFIG"],
  })
  .refine(
    (env) =>
      env.VERCEL_ENV !== "production" ||
      env.ANTICHEAT_CONFIG === undefined ||
      !sameAnticheatConfig(env.ANTICHEAT_CONFIG, DEV_ANTICHEAT_CONFIG),
    {
      message: "ANTICHEAT_CONFIG cannot hold the development thresholds in production, since they are public",
      path: ["ANTICHEAT_CONFIG"],
    },
  )
  .refine((env) => env.VERCEL_ENV !== "preview" || env.REDIS_KEY_PREFIX !== DEFAULT_REDIS_KEY_PREFIX, {
    message: `REDIS_KEY_PREFIX cannot be "${DEFAULT_REDIS_KEY_PREFIX}" in a preview deployment: it would share the Redis keys with production`,
    path: ["REDIS_KEY_PREFIX"],
  })
  .transform((env, ctx) => {
    const preview = env.VERCEL_ENV === "preview";
    // In a preview deployment, its branch's stable URL: the email link and the passkeys work on it.
    const baseURL = env.BETTER_AUTH_URL ?? (preview && env.VERCEL_BRANCH_URL ? `https://${env.VERCEL_BRANCH_URL}` : undefined);
    if (!baseURL) {
      ctx.addIssue({
        code: "custom",
        message: "BETTER_AUTH_URL is required (in Vercel preview deployments it comes from VERCEL_BRANCH_URL)",
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
      ANTICHEAT: env.ANTICHEAT_CONFIG ?? DEV_ANTICHEAT_CONFIG,
      /** Origins Better Auth accepts besides the `BETTER_AUTH_URL` one: the unique deployment URL of a preview deployment. */
      AUTH_TRUSTED_ORIGINS: preview && env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : [],
    };
  });

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  return schema.parse(raw);
}

let cached: ServerEnv | null = null;

/** Server environment variables, validated the first time they are requested (not during the build). */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
