import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Verdict } from "@/lib/game/types";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { createRedis } from "../redis";
import { createRanking, type Ranking } from "./ranking";
import { boardKey, createLeaderboardStore, type Board, type LeaderboardStore } from "./store";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}ranking-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
const changes: Board[][] = [];
const ranking = createRanking({ db, store, onTopChanged: (change) => changes.push(change) });
const saveGame = createSaveGame(db);
const NOW = new Date();
const BOARD: Board = { language: "es", inputType: "physical" };

beforeEach(() => {
  changes.length = 0;
});

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

async function newUser(status: "active" | "shadowbanned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `r_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  await verifyEverywhere(db, row.id);
  return row.id;
}

/** Saves the game (with its bests, if it counts) and asks for its ranking, as `finish` does. */
async function play(
  userId: string | null,
  wpm: number,
  { accuracy = 98, verdict = "valid" as Verdict, startsAt = NOW, using = ranking as Ranking } = {},
) {
  const saved = await saveGame({
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: "es",
    inputType: "physical",
    wpm,
    rawWpm: wpm,
    accuracy,
    verdict,
    rejectReason: verdict === "valid" ? null : "untrusted",
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
  });
  return using.rankGame({
    userId,
    language: "es",
    inputType: "physical",
    verdict,
    wpm,
    accuracy,
    startsAt,
    improved: saved.improved,
  });
}

describe("ranking of a game", () => {
  it("an invalid game has no ranking", async () => {
    expect(await play(await newUser(), 50, { verdict: "rejected" })).toEqual({ kind: "unranked" });
  });

  it("below 90 % accuracy it does not get in", async () => {
    expect(await play(await newUser(), 50, { accuracy: 89.9 })).toEqual({ kind: "low_accuracy" });
  });

  it("with an account: gets into the ranking and returns its position", async () => {
    const fast = await newUser();
    await play(fast, 150);
    const slow = await newUser();
    expect(await play(slow, 140)).toEqual({ kind: "ranked", rank: 2, improved: true });
    expect(await store.position(BOARD, fast)).toBe(1);
  });

  it("without improving, shows the position of their best", async () => {
    const player = await newUser();
    await play(player, 145);
    const result = await play(player, 60);
    expect(result).toMatchObject({ kind: "ranked", improved: false });
    if (result.kind !== "ranked") throw new Error(result.kind);
    expect(result.rank).toBe(await store.position(BOARD, player));
  });

  it("a best from another day still counts: there are no periods", async () => {
    const player = await newUser();
    await play(player, 170, { startsAt: new Date(NOW.getTime() - 40 * 86_400_000) });
    const result = await play(player, 60);
    expect(result).toMatchObject({ kind: "ranked", improved: false });
    if (result.kind !== "ranked") throw new Error(result.kind);
    expect(result.rank).toBe(await store.position(BOARD, player));
  });

  it("anonymous: the position it would have, without writing to the ranking", async () => {
    const before = await redis.zcard(boardKey(prefix, BOARD));
    expect(await play(null, 500)).toEqual({ kind: "would_rank", rank: 1 });
    expect(await redis.zcard(boardKey(prefix, BOARD))).toBe(before);
  });

  it("shadow ban: sees their position as if they were listed, but does not get into the ranking", async () => {
    const hidden = await newUser("shadowbanned");
    expect(await play(hidden, 400)).toEqual({ kind: "ranked", rank: 1, improved: true });
    expect(await store.position(BOARD, hidden)).toBeNull();
    expect(changes).toEqual([]);
  });

  it("getting into the top 100 revalidates that ranking's page", async () => {
    await play(await newUser(), 130);
    expect(changes).toEqual([[BOARD]]);
  });

  it("without improving their best nothing is revalidated", async () => {
    const player = await newUser();
    await play(player, 125);
    changes.length = 0;
    await play(player, 20);
    expect(changes).toEqual([]);
  });

  it("outside the top 100 the page is not revalidated, even if their best improves", async () => {
    const player = await newUser();
    const outsideTop: LeaderboardStore = { ...store, position: async () => 101 };
    const outside = createRanking({ db, store: outsideTop, onTopChanged: (change) => changes.push(change) });
    expect(await play(player, 105, { using: outside })).toEqual({ kind: "ranked", rank: 101, improved: true });
    expect(changes).toEqual([]);
  });

  it("own position: that of their best in that ranking, or null if they have none", async () => {
    const player = await newUser();
    await play(player, 120);
    expect(await ranking.myPosition(player, BOARD)).toEqual({
      rank: await store.position(BOARD, player),
      wpm: 120,
      accuracy: 98,
    });
    expect(await ranking.myPosition(await newUser(), BOARD)).toEqual({ rank: null });
  });

  it("if Redis lost the player's best, it recovers it from PostgreSQL and the position is that of their best", async () => {
    const player = await newUser();
    await play(player, 200);
    await store.remove(player, [BOARD]);
    const result = await play(player, 10);
    expect(result).toMatchObject({ kind: "ranked", improved: false });
    if (result.kind !== "ranked") throw new Error(result.kind);
    const position = await store.position(BOARD, player);
    expect(position).not.toBeNull();
    expect(result.rank).toBe(position);
  });

  it("if the page revalidation fails, the game keeps its ranking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createRanking({
      db,
      store,
      onTopChanged: () => {
        throw new Error("revalidate failed");
      },
    });
    expect(await play(await newUser(), 135, { using: failing })).toMatchObject({ kind: "ranked", rank: expect.any(Number) });
    expect(console.error).toHaveBeenCalledWith("leaderboard revalidation failed", expect.any(Error));
    vi.mocked(console.error).mockRestore();
  });

  it("with Redis down it responds without positions, and the anonymous one can still be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = () => Promise.reject(new Error("redis down"));
    const broken = createRanking({
      db,
      store: { add: down, position: down, positionFor: down, remove: down } satisfies LeaderboardStore,
      onTopChanged: () => {},
    });
    expect(await play(null, 100, { using: broken })).toEqual({ kind: "unavailable", canSave: true });
    expect(await play(await newUser(), 100, { using: broken })).toEqual({ kind: "unavailable", canSave: false });
    vi.mocked(console.error).mockRestore();
  });

  it("if they are sanctioned while their game is being written, they do not stay in Redis", async () => {
    const player = await newUser();
    // The sanction arrives right after writing to Redis and before the final check.
    const sanctionedMidway: LeaderboardStore = {
      ...store,
      async add(entries) {
        await store.add(entries);
        await db.update(users).set({ status: "shadowbanned" }).where(eq(users.id, player));
      },
    };
    const racing = createRanking({ db, store: sanctionedMidway, onTopChanged: () => {} });
    await play(player, 160, { using: racing });
    expect(await store.position(BOARD, player)).toBeNull();
  });
});
