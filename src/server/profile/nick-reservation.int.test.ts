import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createRedis } from "../redis";
import { findFreeNick } from "./nick";
import { createNickAvailability } from "./nick-reservation";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}nick-${randomUUID().slice(0, 8)}:`;
const isNickTaken = createNickAvailability(db, redis, prefix);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

describe("nick reservation", () => {
  it("another user's nick is taken, in any case", async () => {
    const nick = `Res_${randomUUID().slice(0, 8)}`;
    await db.insert(users).values({ name: "", email: `${randomUUID()}@example.com`, nick });
    expect(await isNickTaken(nick.toLowerCase())).toBe(true);
  });

  it("a free nick gets reserved: the next one asking for it sees it taken", async () => {
    const nick = `free_${randomUUID().slice(0, 8)}`;
    expect(await isNickTaken(nick)).toBe(false);
    expect(await isNickTaken(nick.toUpperCase())).toBe(true);
  });

  it("two simultaneous sign-ups with the same randomness get different nicks", async () => {
    const base = `twin${randomUUID().slice(0, 6)}`;
    const sameRandom = () => 0.42;
    const [a, b] = await Promise.all([
      findFreeNick(base, isNickTaken, sameRandom),
      findFreeNick(base, isNickTaken, sameRandom),
    ]);
    expect(a).not.toBe(b);
  });
});
