import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { createRedis } from "../redis";
import { rebuildLeaderboards } from "./rebuild";
import { boardKey } from "./store";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}rebuild-${randomUUID().slice(0, 8)}:`;
const saveGame = createSaveGame(db);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

async function playerWithGame(status: "active" | "banned"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `rb_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  await verifyEverywhere(db, row.id);
  const startsAt = new Date();
  await saveGame({
    id: randomUUID(),
    userId: row.id,
    anonId: randomUUID(),
    language: "en",
    inputType: "physical",
    wpm: 80,
    rawWpm: 80,
    accuracy: 95,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
  });
  return row.id;
}

const BOARD = boardKey(prefix, { language: "en", inputType: "physical" });

describe("Redis rebuild", () => {
  it("without --yes it only counts; with --yes it rewrites without expiry, removes ghosts and deletes the period keys", async () => {
    const player = await playerWithGame("active");
    const banned = await playerWithGame("banned");
    await redis.zadd(BOARD, { score: 1, member: "ghost" });
    // The keys of the old per-period rankings (`lb:{lang}:{input}:{period}:{key}`).
    const day = `${prefix}lb:en:physical:day:2026-10-07`;
    const all = `${prefix}lb:en:physical:all:all`;
    for (const key of [day, all]) await redis.zadd(key, { score: 1, member: player });

    const dryRun = await rebuildLeaderboards(db, redis, prefix, { write: false });
    expect(dryRun.boards).toBeGreaterThan(0);
    expect(dryRun.removed).toBe(2);
    expect(await redis.zscore(BOARD, "ghost")).not.toBeNull();
    expect(await redis.zscore(BOARD, player)).toBeNull();

    await rebuildLeaderboards(db, redis, prefix, { write: true });
    expect(await redis.zscore(BOARD, "ghost")).toBeNull();
    expect(await redis.zscore(BOARD, player)).not.toBeNull();
    expect(await redis.zscore(BOARD, banned)).toBeNull();
    expect(await redis.ttl(BOARD)).toBe(-1);
    expect(await redis.exists(day, all)).toBe(0);
  });

  it("deletes the temporary keys left by an interrupted run", async () => {
    await playerWithGame("active");
    const leftover = `${prefix}lb:pt:touch:rebuild`;
    await redis.zadd(leftover, { score: 1, member: "half" });
    await rebuildLeaderboards(db, redis, prefix, { write: true });
    expect(await redis.exists(leftover)).toBe(0);
    expect(await redis.exists(`${BOARD}:rebuild`)).toBe(0);
  });
});
