import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";
import { createRedis } from "./redis";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}rl-test-${randomUUID().slice(0, 8)}:`;
const HOUR = 3_600_000;
const RULE = { max: 2, windowMs: HOUR };
// Right at the start of a one-hour window: that way the time elapsed in it is 0.
const T0 = Date.UTC(2027, 0, 1, 10);
let clock = T0;
const limit = createRateLimiter(redis, prefix, () => clock);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
});

describe("sliding window limit", () => {
  it("lets through up to the maximum and then says how long is left", async () => {
    clock = T0;
    expect(await limit("start", "a", RULE)).toEqual({ ok: true });
    expect(await limit("start", "a", RULE)).toEqual({ ok: true });
    // Full window: until the next one (1 h) plus 1 ms, rounded up to seconds.
    expect(await limit("start", "a", RULE)).toEqual({ ok: false, retryAfterSeconds: 3_601 });
  });

  it("each identifier and each name count separately", async () => {
    clock = T0;
    await limit("start", "b", RULE);
    await limit("start", "b", RULE);
    expect(await limit("start", "b2", RULE)).toEqual({ ok: true });
    expect(await limit("reports", "b", RULE)).toEqual({ ok: true });
  });

  it("in the next window, the previous one still weighs according to what is left of it", async () => {
    clock = T0;
    await limit("start", "c", RULE);
    await limit("start", "c", RULE);
    // A quarter into the next window: 2 · 0.75 = 1.5 < 2 → one gets in; 1.5 + 1 ≥ 2 → the other does not.
    clock = T0 + HOUR + HOUR / 4;
    expect(await limit("start", "c", RULE)).toEqual({ ok: true });
    expect((await limit("start", "c", RULE)).ok).toBe(false);
    // Two windows later only the middle one weighs (1): it gets in again.
    clock = T0 + 2 * HOUR;
    expect(await limit("start", "c", RULE)).toEqual({ ok: true });
  });
});
