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
 * Lanza un error que nombra la variable que falta o está vacía; los scripts no ven más que esto. Con un entorno de
 * vista previa (`VERCEL_ENV=preview`) el prefijo de Redis es obligatorio y no puede ser el de producción: el script no
 * sabe de qué PR es, y sin prefijo tocaría las claves de producción, que comparten la base de Upstash.
 */
export function parseScriptEnv(raw: Record<string, string | undefined>, source: string): ScriptEnv {
  const value = (name: string) => raw[name]?.trim() ?? "";
  for (const name of Object.values(REQUIRED)) {
    if (value(name) === "") throw new Error(`Falta ${name} en ${source}.`);
  }
  const prefix = value("REDIS_KEY_PREFIX");
  if (value("VERCEL_ENV") === "preview") {
    if (prefix === "") {
      throw new Error(`Falta REDIS_KEY_PREFIX en ${source}: en una vista previa pon el de la vista (pr-<n>: o preview:).`);
    }
    if (prefix === DEFAULT_REDIS_KEY_PREFIX) {
      throw new Error(
        `REDIS_KEY_PREFIX no puede ser "${DEFAULT_REDIS_KEY_PREFIX}" en una vista previa: compartiría las claves de Redis con producción.`,
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
