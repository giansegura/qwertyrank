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

/** Lanza un error que nombra la variable que falta o está vacía; los scripts no ven más que esto. */
export function parseScriptEnv(raw: Record<string, string | undefined>, source: string): ScriptEnv {
  const value = (name: string) => raw[name]?.trim() ?? "";
  for (const name of Object.values(REQUIRED)) {
    if (value(name) === "") throw new Error(`Falta ${name} en ${source}.`);
  }
  return {
    databaseUrl: value(REQUIRED.databaseUrl),
    redisUrl: value(REQUIRED.redisUrl),
    redisToken: value(REQUIRED.redisToken),
    redisKeyPrefix: value("REDIS_KEY_PREFIX") || DEFAULT_REDIS_KEY_PREFIX,
  };
}

/** Destinos legibles para mostrar antes de actuar: solo hosts, nunca usuario, contraseña ni token. */
export function describeTargets(env: ScriptEnv): string {
  const host = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return "(URL no válida)";
    }
  };
  return `PostgreSQL: ${host(env.databaseUrl)} · Redis: ${host(env.redisUrl)} (prefijo ${env.redisKeyPrefix})`;
}
