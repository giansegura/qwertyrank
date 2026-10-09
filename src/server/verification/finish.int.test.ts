import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { VerificationFinishResponse } from "@/lib/game/types";
import type { TypingEvent } from "@/lib/scoring/types";
import { untilASessionWaitsForALock } from "@/test/lock-wait";
import { seedPendingVerification } from "@/test/pending-verification";
import { typed } from "@/test/typing-events";
import { createDb } from "../db/client";
import { bests, games, recordVerifications, users, verifiedLevels } from "../db/schema";
import { createSaveGame, insertGame, type GameRecord } from "../game/persist";
import { createGameService, type GameService } from "../game/service";
import { createGameStore } from "../game/store";
import { createRanking } from "../leaderboard/ranking";
import { boardKey, createLeaderboardStore, type Board, type LeaderboardStore } from "../leaderboard/store";
import { createRedis } from "../redis";
import { spendAttempt } from "./attempts";
import { createSaveVerificationGame } from "./finish";
import { openPendingVerification } from "./pending";
import { DEV_ANTICHEAT_CONFIG } from "../anticheat/config";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}verify-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
const changes: Board[][] = [];
const BOARD: Board = { language: "en", inputType: "physical" };

/** As in production, with a 1.5 s game and no countdown. */
function serviceWith(leaderboard: LeaderboardStore): GameService {
  return createGameService({
    store: createGameStore(redis, process.env.REDIS_KEY_PREFIX!),
    saveGame: createSaveGame(db),
    saveVerificationGame: createSaveVerificationGame(db),
    loadWords: async () => ["hola"],
    random: Math.random,
    newId: randomUUID,
    times: { countdownMs: 0, durationMs: 1_500, graceMs: 500 },
    anticheat: DEV_ANTICHEAT_CONFIG,
    rankGame: createRanking({ db, store: leaderboard, onTopChanged: (change) => changes.push(change) }).rankGame,
  });
}
const service = serviceWith(store);

const ENV = { coarse: false, touchPoints: 0 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** 3 words in 1.5 s: 120 WPM, 100% accuracy, physical keyboard. */
const FAST = typed("hola ".repeat(3), { every: 50, hold: 30 });
/** 1 word: 40 WPM. */
const SLOW = typed("hola ", { every: 50, hold: 30 });
const DAY_MS = 86_400_000;

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
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `vf_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

/** Spends an attempt and starts the verification game, like `POST /api/game/start`. */
async function startVerification(userId: string, verificationId: string, using = service) {
  const spent = await spendAttempt(db, { verificationId, userId, language: "en" });
  if (!spent) throw new Error("no attempts left");
  const owner = randomUUID();
  const { gameId } = await using.start({ owner, userId, language: "en", env: ENV, verification: spent });
  return { owner, gameId };
}

async function finishVerification({ owner, gameId }: { owner: string; gameId: string }, events: TypingEvent[], using = service) {
  await sleep(500);
  expect(await using.appendKeys({ owner, gameId, seq: 1, events })).toBe("ok");
  const outcome = await using.finish({ owner, gameId, lastSeq: 1, ipHash: null });
  if (outcome.kind !== "ok") throw new Error(outcome.kind);
  return outcome.response as VerificationFinishResponse;
}

async function verify(userId: string, verificationId: string, events: TypingEvent[], using = service) {
  return finishVerification(await startVerification(userId, verificationId, using), events, using);
}

/** A verification game already played and scored, ready for `createSaveVerificationGame`. */
const played = (userId: string, wpm: number): GameRecord => ({
  id: randomUUID(),
  userId,
  anonId: randomUUID(),
  language: "en",
  inputType: "physical",
  wpm,
  rawWpm: wpm,
  accuracy: 100,
  verdict: "valid",
  rejectReason: null,
  ipHash: null,
  startsAt: new Date(),
  finishedAt: new Date(),
  words: [],
  batches: [],
});

const verificationRow = async (id: string) =>
  (await db.select().from(recordVerifications).where(eq(recordVerifications.id, id)))[0];
const verdictOf = async (gameId: string) =>
  (await db.select({ verdict: games.verdict }).from(games).where(eq(games.id, gameId)))[0].verdict;
const bestsOf = (userId: string) =>
  db.select({ gameId: bests.gameId, wpm: bests.wpm, achievedAt: bests.achievedAt }).from(bests).where(eq(bests.userId, userId));

describe("verification game (spec 4b §3)", () => {
  it("passed: publishes the record, raises the level, closes the verification and answers with its position", async () => {
    const userId = await newUser();
    const { gameId, verification } = await seedPendingVerification(db, userId, { startsAt: new Date(Date.now() - 60_000) });

    const response = await finishVerification(await startVerification(userId, verification.id), FAST);

    expect(response).toMatchObject({
      verdict: "valid",
      wpm: 120,
      verification: { kind: "verified", ranking: { kind: "ranked", rank: expect.any(Number), improved: true } },
    });
    expect(await verdictOf(gameId)).toBe("valid");
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId, wpm: 100 })]);
    expect(await verificationRow(verification.id)).toMatchObject({ status: "verified", attempts: 1, resolvedAt: expect.any(Date) });
    const [level] = await db.select().from(verifiedLevels).where(eq(verifiedLevels.userId, userId));
    expect(level).toMatchObject({ language: "en", inputType: "physical", wpm: 100 });
    expect(await store.position(BOARD, userId)).not.toBeNull();
    expect(changes.flat()).toContainEqual(BOARD);

    // The verification game is saved with its mode and verification, with no bests of its own.
    const [played] = await db
      .select()
      .from(games)
      .where(and(eq(games.verificationId, verification.id), eq(games.mode, "verification")));
    expect(played).toMatchObject({ verdict: "valid", wpm: 120, userId });
    expect((await bestsOf(userId)).map((best) => best.gameId)).not.toContain(played.id);
  });

  it("a record from days ago enters the ranking with its original time, with no expiry in Redis", async () => {
    const userId = await newUser();
    const lastNight = new Date(Date.now() - DAY_MS);
    const longAgo = new Date(Date.now() - 9 * DAY_MS);
    // The record's game, from last night, and two slower ones that were awaiting the same verification.
    const { gameId, verification } = await seedPendingVerification(db, userId, { startsAt: lastNight });
    const old = await seedPendingVerification(db, userId, { startsAt: longAgo, wpm: 80 });
    const recent = await seedPendingVerification(db, userId, { startsAt: new Date(Date.now() - 2 * DAY_MS), wpm: 90 });
    expect([old.verification.id, recent.verification.id]).toEqual([verification.id, verification.id]);

    const response = await verify(userId, verification.id, FAST);

    const position = await store.position(BOARD, userId);
    expect(position).not.toBeNull();
    expect(response.verification).toEqual({ kind: "verified", ranking: { kind: "ranked", rank: position, improved: true } });
    // All three become `valid`; the best is the fastest one, with the time it was played.
    for (const game of [gameId, old.gameId, recent.gameId]) expect(await verdictOf(game)).toBe("valid");
    expect(await bestsOf(userId)).toEqual([{ gameId, wpm: 100, achievedAt: lastNight }]);
    expect(await redis.ttl(boardKey(prefix, BOARD))).toBe(-1);
  });

  it("not passed: the remaining attempts stay pending; on the third, failed and the record stays in review", async () => {
    const userId = await newUser();
    const { gameId, verification } = await seedPendingVerification(db, userId);

    expect((await verify(userId, verification.id, SLOW)).verification).toEqual({
      kind: "failed",
      requiredWpm: 85,
      attemptsLeft: 2,
    });
    expect(await verificationRow(verification.id)).toMatchObject({ status: "pending", attempts: 1, resolvedAt: null });
    expect((await verify(userId, verification.id, SLOW)).verification).toMatchObject({ attemptsLeft: 1 });
    expect((await verify(userId, verification.id, SLOW)).verification).toMatchObject({ attemptsLeft: 0 });

    expect(await verificationRow(verification.id)).toMatchObject({ status: "failed", attempts: 3, resolvedAt: expect.any(Date) });
    expect(await verdictOf(gameId)).toBe("review");
    expect(await bestsOf(userId)).toEqual([]);
  });

  it("with another keyboard it does not count, even if it reaches the WPM", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { inputType: "touch" });
    expect((await verify(userId, verification.id, FAST)).verification).toEqual({
      kind: "failed",
      requiredWpm: 85,
      attemptsLeft: 2,
    });
  });

  it("if the target rises mid-attempt, it is judged against the current one", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { wpm: 100 });
    const playing = await startVerification(userId, verification.id);
    // While playing, another better game (e.g. on another device) becomes the target.
    await seedPendingVerification(db, userId, { wpm: 150 });

    expect((await finishVerification(playing, FAST)).verification).toEqual({
      kind: "failed",
      requiredWpm: 127.5,
      attemptsLeft: 2,
    });
  });

  it("if the target changes while the finish waits for the verification, it is judged against the new one", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { wpm: 100 });
    const spent = await spendAttempt(db, { verificationId: verification.id, userId, language: "en" });
    const faster = played(userId, 150);

    // A: a better game (e.g. on another device) becomes the target, and A does not commit until
    // the verification game's finish is waiting on that verification.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let retargeted = () => {};
    const retargetedByA = new Promise<void>((resolve) => (retargeted = resolve));
    const a = db.transaction(async (tx) => {
      await insertGame(tx, faster, { verdict: "review" });
      await openPendingVerification(tx, { userId, language: "en", inputType: "physical", gameId: faster.id, wpm: 150 });
      retargeted();
      await gate;
    });
    const game = played(userId, 120);
    try {
      await retargetedByA;
      const finished = createSaveVerificationGame(db)(game, spent!);
      await untilASessionWaitsForALock(db);
      release();
      await a;
      // 120 WPM do not reach 85% of the new target's 150: one attempt fewer is left, nothing more.
      expect(await finished).toEqual({ kind: "failed", requiredWpm: 127.5, attemptsLeft: 2 });
    } finally {
      release();
    }
    expect(await verificationRow(verification.id)).toMatchObject({ gameId: faster.id, status: "pending", attempts: 1 });
    expect(await db.select({ id: games.id }).from(games).where(eq(games.id, game.id))).toHaveLength(1);
  });

  it("from another device: starting there closes the game here, and each start spends its attempt", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    const here = await startVerification(userId, verification.id);
    const there = await startVerification(userId, verification.id);

    await sleep(500);
    expect(await service.finish({ ...here, lastSeq: 0, ipHash: null })).toEqual({ kind: "closed" });
    expect((await finishVerification(there, FAST)).verification.kind).toBe("verified");
    expect(await verificationRow(verification.id)).toMatchObject({ status: "verified", attempts: 2 });
  });

  it("already verified from another device, a finish that falls short neither closes nor publishes it again", async () => {
    const userId = await newUser();
    const { gameId, verification } = await seedPendingVerification(db, userId);
    const saveVerificationGame = createSaveVerificationGame(db);

    const passed = await saveVerificationGame(played(userId, 120), { id: verification.id, attempt: 2 });
    expect(passed).toMatchObject({ kind: "verified", published: [{ gameId }] });
    // The third attempt, on the other device, finishes later and does not reach the WPM.
    const late = await saveVerificationGame(played(userId, 40), { id: verification.id, attempt: 3 });
    expect(late).toMatchObject({ kind: "verified", target: { gameId }, published: [] });
    expect(await verificationRow(verification.id)).toMatchObject({ status: "verified" });
    expect(await verdictOf(gameId)).toBe("valid");
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId })]);
  });

  it("if the account is deleted mid-attempt, there is nothing to verify: failed and the game is not saved", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    const playing = await startVerification(userId, verification.id);
    // While playing, the account is deleted: its verification is cascade-deleted.
    await db.delete(users).where(eq(users.id, userId));

    expect((await finishVerification(playing, FAST)).verification).toEqual({
      kind: "failed",
      requiredWpm: 0,
      attemptsLeft: 0,
    });
    expect(await db.select({ id: games.id }).from(games).where(eq(games.id, playing.gameId))).toEqual([]);
  });

  it("under shadow ban the same flow: published in PostgreSQL, but not added to Redis", async () => {
    const userId = await newUser("shadowbanned");
    const { gameId, verification } = await seedPendingVerification(db, userId);
    expect((await verify(userId, verification.id, FAST)).verification).toMatchObject({
      kind: "verified",
      ranking: { kind: "ranked", rank: expect.any(Number), improved: true },
    });
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId })]);
    expect(await store.position(BOARD, userId)).toBeNull();
  });

  it("with Redis down, the record stays published in PostgreSQL and the response says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = async () => {
      throw new Error("redis down");
    };
    const broken = serviceWith({ add: down, position: down, positionFor: down, remove: down });
    const userId = await newUser();
    const { gameId, verification } = await seedPendingVerification(db, userId);
    expect((await verify(userId, verification.id, FAST, broken)).verification).toEqual({
      kind: "verified",
      ranking: { kind: "unavailable", canSave: false },
    });
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId })]);
    expect(await verificationRow(verification.id)).toMatchObject({ status: "verified" });
    vi.mocked(console.error).mockRestore();
  });
});
