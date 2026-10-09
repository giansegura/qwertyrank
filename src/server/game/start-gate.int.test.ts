import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createRateLimiter, type RateLimit } from "../rate-limit";
import { createRedis } from "../redis";
import { isValidHumanPass, issueHumanPass } from "./human-pass";
import { createStartGate, type StartGateInput } from "./start-gate";
import { TurnstileUnavailableError, type VerifyTurnstile } from "./turnstile";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}gate-${randomUUID().slice(0, 8)}:`;
const SECRET = "p".repeat(32);
const NOW = new Date("2026-10-06T12:00:00Z");
const HOUR = 3_600_000;
const WIDE = { owner: { max: 100, windowMs: HOUR }, ip: { max: 150, windowMs: HOUR } };

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

const goodToken: VerifyTurnstile = async (token) => token === "good";

function gate(verify: VerifyTurnstile | null = goodToken, limits: { owner: RateLimit; ip: RateLimit } = WIDE) {
  return createStartGate({
    db,
    limit: createRateLimiter(redis, prefix, () => NOW.getTime()),
    verifyTurnstile: verify,
    passSecret: SECRET,
    ipSecret: SECRET,
    limits,
    now: () => NOW,
  });
}

const input = (overrides: Partial<StartGateInput> = {}): StartGateInput => ({
  anonId: randomUUID(),
  userId: null,
  ip: randomUUID(),
  pass: undefined,
  turnstileToken: undefined,
  ...overrides,
});

async function newUser(status: "active" | "shadowbanned" | "banned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `g_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

describe("start gate", () => {
  it("without Turnstile configured it does not ask for the challenge", async () => {
    expect(await gate(null)(input())).toEqual({ kind: "ok", newPass: null });
  });

  it("without a pass or token it asks for the challenge without calling Cloudflare", async () => {
    const verify = vi.fn(goodToken);
    expect(await gate(verify)(input())).toEqual({ kind: "needs_challenge" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("with a good token it issues a one-hour pass for that anonymous user", async () => {
    const anonId = randomUUID();
    const outcome = await gate()(input({ anonId, turnstileToken: "good" }));
    if (outcome.kind !== "ok") throw new Error(outcome.kind);
    expect(isValidHumanPass(outcome.newPass ?? undefined, anonId, SECRET, NOW)).toBe(true);
  });

  it("with a rejected (or already used) token it asks for the challenge again", async () => {
    expect(await gate()(input({ turnstileToken: "bad" }))).toEqual({ kind: "needs_challenge" });
  });

  it("with a valid pass it does not call Cloudflare", async () => {
    const verify = vi.fn(goodToken);
    const anonId = randomUUID();
    const pass = issueHumanPass(anonId, SECRET, NOW);
    expect(await gate(verify)(input({ anonId, pass }))).toEqual({ kind: "ok", newPass: null });
    expect(verify).not.toHaveBeenCalled();
  });

  it("another anonymous user's pass is not valid", async () => {
    const pass = issueHumanPass(randomUUID(), SECRET, NOW);
    expect(await gate()(input({ pass }))).toEqual({ kind: "needs_challenge" });
  });

  it("if Cloudflare does not respond, it throws (the route answers 503)", async () => {
    const down = gate(async () => {
      throw new TurnstileUnavailableError("down");
    });
    await expect(down(input({ turnstileToken: "good" }))).rejects.toBeInstanceOf(TurnstileUnavailableError);
  });

  it("a banned account does not start; a shadow banned one does, without noticing", async () => {
    const withPass = (userId: string) => {
      const anonId = randomUUID();
      return input({ anonId, userId, pass: issueHumanPass(anonId, SECRET, NOW) });
    };
    expect(await gate()(withPass(await newUser("banned")))).toEqual({ kind: "banned", newPass: null });
    expect(await gate()(withPass(await newUser("shadowbanned")))).toEqual({ kind: "ok", newPass: null });
  });

  it("per-player limit: with an account it counts per user even across browsers", async () => {
    const limited = gate(null, { owner: { max: 2, windowMs: HOUR }, ip: WIDE.ip });
    const userId = await newUser();
    expect((await limited(input({ userId }))).kind).toBe("ok");
    expect((await limited(input({ userId }))).kind).toBe("ok");
    const third = await limited(input({ userId }));
    if (third.kind !== "rate_limited") throw new Error(third.kind);
    expect(third.retryAfter).toBeGreaterThan(0);
  });

  it("per-IP limit: many anonymous users from the same IP", async () => {
    const limited = gate(null, { owner: WIDE.owner, ip: { max: 2, windowMs: HOUR } });
    const ip = randomUUID();
    await limited(input({ ip }));
    await limited(input({ ip }));
    expect(await limited(input({ ip }))).toMatchObject({ kind: "rate_limited" });
    expect((await limited(input())).kind).toBe("ok");
    // With no known IP only the per-player limit counts.
    expect((await limited(input({ ip: null }))).kind).toBe("ok");
  });

  it("if Redis fails, it throws (the route answers 503)", async () => {
    const broken = createStartGate({
      db,
      limit: async () => {
        throw new Error("redis down");
      },
      verifyTurnstile: null,
      passSecret: SECRET,
      ipSecret: SECRET,
    });
    await expect(broken(input())).rejects.toThrow("redis down");
  });
});
