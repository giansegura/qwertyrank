import "server-only";
import type { Redis } from "@upstash/redis";

export interface RateLimit {
  max: number;
  windowMs: number;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Ventana deslizante aproximada: lo de la ventana fija actual más la parte de la anterior que aún
 * cae dentro de la última `windowMs`. Un solo comando. KEYS: ventana actual y anterior; ARGV: máximo,
 * duración de la ventana y milisegundos transcurridos en la actual. Devuelve {permitido, actual, anterior}.
 */
const SLIDING_WINDOW = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local previous = tonumber(redis.call('GET', KEYS[2]) or '0')
local max = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local elapsed = tonumber(ARGV[3])
if previous * (window - elapsed) / window + current >= max then
  return {0, current, previous}
end
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], window * 2)
return {1, current + 1, previous}`;

/**
 * Milisegundos hasta que vuelva a caber una más, con la misma cuenta que el script:
 * `anterior · (W − e) / W + actual < máximo`.
 */
export function retryAfterMs({ max, windowMs }: RateLimit, current: number, previous: number, elapsed: number): number {
  // La actual ya está llena: solo cabe en la siguiente, cuando lo de esta (que pasa a ser la anterior) pese menos.
  if (current >= max) return windowMs - elapsed + Math.ceil(windowMs * (1 - max / current)) + 1;
  return Math.max(1, Math.ceil(windowMs * (1 - (max - current) / previous)) - elapsed + 1);
}

export type RateLimiter = (name: string, id: string, limit: RateLimit) => Promise<RateLimitResult>;

/** Límites en Redis (spec 4a §2): `<prefix>rl:<name>:<id>:<ventana>`. `now` es inyectable para los tests. */
export function createRateLimiter(redis: Redis, prefix: string, now: () => number = Date.now): RateLimiter {
  return async (name, id, limit) => {
    const at = now();
    const index = Math.floor(at / limit.windowMs);
    const elapsed = at - index * limit.windowMs;
    const base = `${prefix}rl:${name}:${id}`;
    const [allowed, current, previous] = (await redis.eval(
      SLIDING_WINDOW,
      [`${base}:${index}`, `${base}:${index - 1}`],
      [String(limit.max), String(limit.windowMs), String(elapsed)],
    )) as number[];
    if (Number(allowed) === 1) return { ok: true };
    const wait = retryAfterMs(limit, Number(current), Number(previous), elapsed);
    return { ok: false, retryAfterSeconds: Math.ceil(wait / 1000) };
  };
}
