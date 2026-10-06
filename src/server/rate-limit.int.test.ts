import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";
import { createRedis } from "./redis";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}rl-test-${randomUUID().slice(0, 8)}:`;
const HOUR = 3_600_000;
const RULE = { max: 2, windowMs: HOUR };
// Justo al empezar una ventana de una hora: así el tiempo transcurrido en ella es 0.
const T0 = Date.UTC(2027, 0, 1, 10);
let clock = T0;
const limit = createRateLimiter(redis, prefix, () => clock);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
});

describe("límite de ventana deslizante", () => {
  it("deja pasar hasta el máximo y luego dice cuánto falta", async () => {
    clock = T0;
    expect(await limit("start", "a", RULE)).toEqual({ ok: true });
    expect(await limit("start", "a", RULE)).toEqual({ ok: true });
    // Ventana llena: hasta la siguiente (1 h) y 1 ms más, redondeado hacia arriba a segundos.
    expect(await limit("start", "a", RULE)).toEqual({ ok: false, retryAfterSeconds: 3_601 });
  });

  it("cada identificador y cada nombre cuentan aparte", async () => {
    clock = T0;
    await limit("start", "b", RULE);
    await limit("start", "b", RULE);
    expect(await limit("start", "b2", RULE)).toEqual({ ok: true });
    expect(await limit("reports", "b", RULE)).toEqual({ ok: true });
  });

  it("en la ventana siguiente, la anterior aún pesa según lo que queda de ella", async () => {
    clock = T0;
    await limit("start", "c", RULE);
    await limit("start", "c", RULE);
    // A un cuarto de la ventana siguiente: 2 · 0,75 = 1,5 < 2 → entra una; 1,5 + 1 ≥ 2 → la otra no.
    clock = T0 + HOUR + HOUR / 4;
    expect(await limit("start", "c", RULE)).toEqual({ ok: true });
    expect((await limit("start", "c", RULE)).ok).toBe(false);
    // Dos ventanas después solo pesa la del medio (1): vuelve a entrar.
    clock = T0 + 2 * HOUR;
    expect(await limit("start", "c", RULE)).toEqual({ ok: true });
  });
});
