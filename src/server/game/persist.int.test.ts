import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { emptyBoards } from "@/test/empty-boards";
import { untilASessionWaitsForALock } from "@/test/lock-wait";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { bests, games, keystrokeLogs, recordVerifications, users } from "../db/schema";
import { openPendingVerification } from "../verification/pending";
import { decodeKeystrokeLog } from "./keystroke-log";
import { createSaveGame, insertGame, type GameRecord } from "./persist";

const db = createDb(process.env.DATABASE_URL!);
const saveGame = createSaveGame(db);

afterAll(async () => {
  await db.$client.end();
});

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: randomUUID(),
    userId: null,
    anonId: randomUUID(),
    language: "pt",
    inputType: "touch",
    wpm: 61.5,
    rawWpm: 64,
    accuracy: 97.25,
    verdict: "valid",
    rejectReason: null,
    ipHash: "a".repeat(64),
    startsAt: new Date("2026-10-05T10:00:00Z"),
    finishedAt: new Date("2026-10-05T10:00:31Z"),
    words: ["a", "casa"],
    batches: [{ seq: 1, arrivedAt: 123, events: [{ t: 0, type: "input", deleted: 0, inserted: "a", trusted: true }] }],
    ...overrides,
  };
}

async function newUser({ verified = true, status = "active" as "active" | "shadowbanned" } = {}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `p_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  if (verified) await verifyEverywhere(db, user.id);
  return user.id;
}

const verificationOf = async (gameId: string) => {
  const [row] = await db
    .select({ verificationId: games.verificationId, verdict: games.verdict })
    .from(games)
    .where(eq(games.id, gameId));
  const [verification] = await db.select().from(recordVerifications).where(eq(recordVerifications.id, row.verificationId!));
  return { verdict: row.verdict, verification };
};

describe("saveGame (PostgreSQL)", () => {
  it("saves the game and its compressed keystroke log, with the words", async () => {
    const input = record();
    await saveGame(input);

    const [game] = await db.select().from(games).where(eq(games.id, input.id));
    expect(game).toMatchObject({ language: "pt", inputType: "touch", wpm: 61.5, verdict: "valid", anonId: input.anonId, mode: "ranked" });

    const [log] = await db.select().from(keystrokeLogs).where(eq(keystrokeLogs.gameId, input.id));
    expect(JSON.parse(gunzipSync(log.events).toString("utf8"))).toEqual({ words: input.words, batches: input.batches });
    expect(decodeKeystrokeLog(log.events)).toEqual({ words: ["a", "casa"], events: input.batches[0].events });
  });

  it("also saves rejected games with their reason", async () => {
    const input = record({ verdict: "rejected", rejectReason: "untrusted" });
    await saveGame(input);
    const [game] = await db.select().from(games).where(eq(games.id, input.id));
    expect(game.rejectReason).toBe("untrusted");
  });

  it("does not save the same game twice", async () => {
    const input = record();
    await saveGame(input);
    await expect(saveGame({ ...input, id: input.id })).rejects.toThrow();
    const rows = await db.select().from(games).where(eq(games.id, input.id));
    expect(rows).toHaveLength(1);
  });

  it("with a user and at least 90% accuracy, saves their best in the same transaction", async () => {
    const input = record({ userId: await newUser() });
    expect(await saveGame(input)).toEqual({ improved: true, review: null });
    expect(await db.select().from(bests).where(eq(bests.gameId, input.id))).toHaveLength(1);
  });

  it("without a user or below 90% accuracy, saves no best", async () => {
    expect((await saveGame(record())).improved).toBe(false);
    expect((await saveGame(record({ userId: await newUser(), accuracy: 89.9 }))).improved).toBe(false);
  });
});

describe("saveGame: records in review (spec 4b §2)", () => {
  // Each test starts with empty rankings: any game without a verified level enters the top 10.
  beforeEach(async () => {
    await emptyBoards(db);
  });

  it("without a verified level and in the top 10: review, no best and a 24 h verification", async () => {
    const input = record({ userId: await newUser({ verified: false }), wpm: 72.4 });
    const saved = await saveGame(input);

    expect(saved.improved).toBe(false);
    expect(saved.review).toEqual({
      rank: 1,
      verification: {
        id: expect.any(String),
        language: "pt",
        inputType: "touch",
        targetWpm: 72.4,
        requiredWpm: 61.6,
        attemptsLeft: 3,
        expiresAt: expect.any(String),
      },
    });
    const hours = (Date.parse(saved.review!.verification.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);
    expect(await db.select().from(bests).where(eq(bests.gameId, input.id))).toEqual([]);
    expect(await verificationOf(input.id)).toMatchObject({
      verdict: "review",
      verification: { id: saved.review!.verification.id, gameId: input.id, status: "pending", attempts: 0 },
    });
  });

  it("under shadow ban, the same flow: the sanction is not noticeable", async () => {
    const input = record({ userId: await newUser({ verified: false, status: "shadowbanned" }) });
    const saved = await saveGame(input);

    expect(saved).toMatchObject({ improved: false, review: { rank: 1 } });
    expect(await verificationOf(input.id)).toMatchObject({
      verdict: "review",
      verification: { id: saved.review!.verification.id, gameId: input.id, status: "pending", attempts: 0 },
    });
    expect(await db.select().from(bests).where(eq(bests.gameId, input.id))).toEqual([]);
  });

  it("below their level × 1.10 it is published directly", async () => {
    const input = record({ userId: await newUser() });
    expect(await saveGame(input)).toEqual({ improved: true, review: null });
    expect(await db.select().from(bests).where(eq(bests.gameId, input.id))).toHaveLength(1);
  });

  it("a better second game in review replaces the first and renews the deadline; the attempts stay", async () => {
    const userId = await newUser({ verified: false });
    const first = record({ userId, wpm: 60 });
    const { review } = await saveGame(first);
    await db
      .update(recordVerifications)
      .set({ attempts: 2, expiresAt: sql`now() + interval '1 hour'` })
      .where(eq(recordVerifications.id, review!.verification.id));

    const better = record({ userId, wpm: 70 });
    const second = await saveGame(better);
    expect(second.review?.verification).toMatchObject({ id: review!.verification.id, targetWpm: 70, attemptsLeft: 1 });
    expect(Date.parse(second.review!.verification.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3_600_000);

    const worse = record({ userId, wpm: 65 });
    expect((await saveGame(worse)).review?.verification).toMatchObject({ id: review!.verification.id, targetWpm: 70 });
    for (const game of [first, better, worse]) {
      expect((await verificationOf(game.id)).verification).toMatchObject({ id: review!.verification.id, gameId: better.id });
    }
  });

  it("an expired pending one is closed as failed and the new game opens another", async () => {
    const userId = await newUser({ verified: false });
    const first = record({ userId });
    const { review } = await saveGame(first);
    const [expired] = await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(recordVerifications.id, review!.verification.id))
      .returning();

    const next = await saveGame(record({ userId }));
    expect(next.review?.verification.id).not.toBe(review!.verification.id);
    expect(next.review?.verification.attemptsLeft).toBe(3);
    const [closed] = await db.select().from(recordVerifications).where(eq(recordVerifications.id, expired.id));
    expect(closed).toMatchObject({ status: "failed", resolvedAt: expired.expiresAt });
  });

  it("a pending one with no attempts left is closed as failed and the new game opens another with all 3", async () => {
    const userId = await newUser({ verified: false });
    const first = record({ userId });
    const { review } = await saveGame(first);
    await db.update(recordVerifications).set({ attempts: 3 }).where(eq(recordVerifications.id, review!.verification.id));

    const next = record({ userId });
    const saved = await saveGame(next);
    expect(saved.review?.verification.id).not.toBe(review!.verification.id);
    expect(saved.review?.verification.attemptsLeft).toBe(3);
    const opened = await verificationOf(next.id);
    expect(opened).toMatchObject({
      verdict: "review",
      verification: { id: saved.review!.verification.id, gameId: next.id, status: "pending", attempts: 0 },
    });
    // It is closed when the new game is saved (its transaction's `now()`), even though it has not expired yet.
    const closed = await verificationOf(first.id);
    expect(closed.verification).toMatchObject({ status: "failed", resolvedAt: opened.verification.createdAt });
    expect(closed.verification.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("two games in review saved at once: the target is the fastest one", async () => {
    const userId = await newUser({ verified: false });
    const fast = record({ userId, wpm: 100 });
    const slow = record({ userId, wpm: 50 });

    // A opens the verification for the fast one and does not commit until B is waiting on that pending one.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let opened = () => {};
    const openedByA = new Promise<void>((resolve) => (opened = resolve));
    const a = db.transaction(async (tx) => {
      await insertGame(tx, fast, { verdict: "review" });
      await openPendingVerification(tx, { userId, language: "pt", inputType: "touch", gameId: fast.id, wpm: fast.wpm });
      opened();
      await gate;
    });
    try {
      await openedByA;
      const b = saveGame(slow);
      await untilASessionWaitsForALock(db);
      release();
      await a;
      expect((await b).review?.verification).toMatchObject({ targetWpm: 100 });
    } finally {
      release();
    }
    for (const game of [fast, slow]) {
      expect((await verificationOf(game.id)).verification).toMatchObject({ gameId: fast.id, status: "pending" });
    }
  });
});
