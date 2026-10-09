import "server-only";
import { DEFAULT_REDIS_KEY_PREFIX } from "./env";

export interface ScriptEnv {
  databaseUrl: string;
  redisUrl: string;
  redisToken: string;
  redisKeyPrefix: string;
}

const REQUIRED = {
  databaseUrl: "DATABASE_URL",
  redisUrl: "UPSTASH_REDIS_REST_URL",
  redisToken: "UPSTASH_REDIS_REST_TOKEN",
} as const;

/**
 * Throws an error naming the variable that is missing or empty; scripts see nothing more than this. With a preview
 * environment (`VERCEL_ENV=preview`) the Redis prefix is required and cannot be the production one: the script does
 * not know which PR it is for, and without a prefix it would touch the production keys, which share the Upstash DB.
 */
export function parseScriptEnv(raw: Record<string, string | undefined>, source: string): ScriptEnv {
  const value = (name: string) => raw[name]?.trim() ?? "";
  for (const name of Object.values(REQUIRED)) {
    if (value(name) === "") throw new Error(`Missing ${name} in ${source}.`);
  }
  const prefix = value("REDIS_KEY_PREFIX");
  if (value("VERCEL_ENV") === "preview") {
    if (prefix === "") {
      throw new Error(`Missing REDIS_KEY_PREFIX in ${source}: in a preview deployment set the deployment's one (pr-<n>: or preview:).`);
    }
    if (prefix === DEFAULT_REDIS_KEY_PREFIX) {
      throw new Error(
        `REDIS_KEY_PREFIX cannot be "${DEFAULT_REDIS_KEY_PREFIX}" in a preview deployment: it would share the Redis keys with production.`,
      );
    }
  }
  return {
    databaseUrl: value(REQUIRED.databaseUrl),
    redisUrl: value(REQUIRED.redisUrl),
    redisToken: value(REQUIRED.redisToken),
    redisKeyPrefix: prefix || DEFAULT_REDIS_KEY_PREFIX,
  };
}

/** Readable targets to show before acting: hosts only, never user, password or token. */
export function describeTargets(env: ScriptEnv): string {
  const host = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return "(invalid URL)";
    }
  };
  return `PostgreSQL: ${host(env.databaseUrl)} · Redis: ${host(env.redisUrl)} (prefix ${env.redisKeyPrefix})`;
}
