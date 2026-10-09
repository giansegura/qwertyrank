import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { createDb } from "../db/client";
import { bests, games, keystrokeLogs, rhythmSamples, users } from "../db/schema";
import { encodeKeystrokeLog } from "../game/keystroke-log";
import { runDailyRetention } from "./daily";
import { MAX_RHYTHM_MS, rhythmOf, weekOf } from "./rhythm";

const db = createDb(process.env.DATABASE_URL!);
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

afterAll(async () => {
  await db.$client.end();
});

/** The keystrokes of "hola": down/input/up per letter, 120 ms between letters. */
const EVENTS: TypingEvent[] = [..."hola"].flatMap((char, i): TypingEvent[] => [
  { t: i * 120, type: "down", key: char, code: `Key${char.toUpperCase()}`, trusted: true },
  { t: i * 120 + 1, type: "input", deleted: 0, inserted: char, trusted: true },
  { t: i * 120 + 70, type: "up", key: char, code: `Key${char.toUpperCase()}`, trusted: true },
]);

/**
 * An integer WPM nobody else uses: that is how this game's sample is found, since it does not store its id.
 * Integer and large so the sample's rounding does not change it and it does not clash with other runs.
 */
const uniqueWpm = () => 1_000_000 + Math.floor(Math.random() * 1e9);

async function newUser(status: "active" | "shadowbanned" | "banned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `rt_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

/** A game finished `days` days ago with its keystroke log from that same moment. */
async function oldGame({
  days,
  userId = null as string | null,
  wpm = uniqueWpm(),
  log = encodeKeystrokeLog({ words: ["hola"], batches: [{ seq: 1, arrivedAt: 0, events: EVENTS }] }) as Buffer | null,
}: { days: number; userId?: string | null; wpm?: number; log?: Buffer | null }) {
  const id = randomUUID();
  const when = daysAgo(days);
  await db.insert(games).values({
    id,
    userId,
    anonId: randomUUID(),
    ipHash: "a".repeat(64),
    language: "pt",
    inputType: "physical",
    wpm,
    rawWpm: wpm,
    accuracy: 97.5,
    verdict: "valid",
    startsAt: when,
    finishedAt: when,
  });
  if (log) await db.insert(keystrokeLogs).values({ gameId: id, events: log, createdAt: when });
  return { id, wpm, startsAt: when };
}

const logOf = async (gameId: string) => (await db.select().from(keystrokeLogs).where(eq(keystrokeLogs.gameId, gameId)))[0];
const samplesWith = (wpm: number) => db.select().from(rhythmSamples).where(eq(rhythmSamples.wpm, wpm));
const gameRow = async (gameId: string) => (await db.select().from(games).where(eq(games.id, gameId)))[0];

describe("daily task: keystrokes (spec 5a §3.2.1)", () => {
  it("after 30 days saves the rhythm sample, without identifiers, and deletes the keystrokes", async () => {
    const userId = await newUser();
    const old = await oldGame({ days: 31, userId });
    const recent = await oldGame({ days: 29, userId });

    expect(await runDailyRetention(db)).toMatchObject({ done: true });

    expect(await logOf(old.id)).toBeUndefined();
    expect(await logOf(recent.id)).toBeDefined();
    const [sample] = await samplesWith(old.wpm);
    expect(sample).toEqual({
      id: expect.any(String),
      language: "pt",
      inputType: "physical",
      mode: "ranked",
      verdict: "valid",
      rejectReason: null,
      wpm: old.wpm,
      accuracy: 98,
      playedWeek: weekOf(old.startsAt),
      playerStatus: "active",
      ...rhythmOf(EVENTS),
      createdAt: expect.any(Date),
    });
    expect(await samplesWith(recent.wpm)).toEqual([]);
  });

  it("the sample stores rounded WPM and accuracy", async () => {
    const wpm = uniqueWpm();
    await oldGame({ days: 31, wpm: wpm + 0.4 });

    await runDailyRetention(db);

    expect(await samplesWith(wpm + 0.4)).toEqual([]);
    const [sample] = await samplesWith(wpm);
    expect(sample).toMatchObject({ wpm, accuracy: 98 });
  });

  it("the keystrokes of a current best stay, even when older than 30 days", async () => {
    const userId = await newUser();
    const best = await oldGame({ days: 40, userId });
    await db.insert(bests).values({
      userId,
      language: "pt",
      inputType: "physical",
      gameId: best.id,
      wpm: best.wpm,
      accuracy: 97.5,
      score: 1,
      achievedAt: best.startsAt,
    });

    await runDailyRetention(db);

    expect(await logOf(best.id)).toBeDefined();
    expect(await samplesWith(best.wpm)).toEqual([]);
  });

  it("the label is the player's status, and anonymous if the game has none", async () => {
    const shadow = await oldGame({ days: 31, userId: await newUser("shadowbanned") });
    const banned = await oldGame({ days: 31, userId: await newUser("banned") });
    const anonymous = await oldGame({ days: 31 });

    await runDailyRetention(db);

    expect((await samplesWith(shadow.wpm))[0].playerStatus).toBe("shadowbanned");
    expect((await samplesWith(banned.wpm))[0].playerStatus).toBe("banned");
    expect((await samplesWith(anonymous.wpm))[0].playerStatus).toBe("anonymous");
  });

  it("an unreadable log or one without events is deleted without a sample", async () => {
    const broken = await oldGame({ days: 31, log: Buffer.from("not gzip") });
    const empty = await oldGame({ days: 31, log: gzipSync(JSON.stringify({ words: ["hola"], batches: [] })) });

    await runDailyRetention(db);

    for (const game of [broken, empty]) {
      expect(await logOf(game.id)).toBeUndefined();
      expect(await samplesWith(game.wpm)).toEqual([]);
    }
  });

  it("an event with an out-of-range t does not block the task: it is extracted with capped times", async () => {
    const huge: TypingEvent[] = [
      { t: 0, type: "input", deleted: 0, inserted: "a", trusted: true },
      { t: 3e9, type: "input", deleted: 0, inserted: "b", trusted: true },
    ];
    const crafted = await oldGame({
      days: 31,
      log: encodeKeystrokeLog({ words: ["ab"], batches: [{ seq: 1, arrivedAt: 0, events: huge }] }),
    });

    expect(await runDailyRetention(db)).toMatchObject({ done: true });

    expect(await logOf(crafted.id)).toBeUndefined();
    expect((await samplesWith(crafted.wpm))[0].intervalsMs).toEqual([MAX_RHYTHM_MS]);
  });

  it("in batches, and two concurrent runs do not duplicate any sample", async () => {
    const wpm = uniqueWpm();
    const played = [];
    for (let i = 0; i < 5; i++) played.push(await oldGame({ days: 31 + i, wpm }));

    const reports = await Promise.all([runDailyRetention(db, { batchSize: 2 }), runDailyRetention(db, { batchSize: 2 })]);
    await runDailyRetention(db, { batchSize: 2 });

    expect(reports.every((report) => report.done)).toBe(true);
    expect(await samplesWith(wpm)).toHaveLength(5);
    for (const game of played) expect(await logOf(game.id)).toBeUndefined();
  });

  it("with no time, does nothing and says work remains", async () => {
    const old = await oldGame({ days: 31 });
    expect(await runDailyRetention(db, { budgetMs: 0 })).toEqual({
      extracted: 0,
      deletedLogs: 0,
      anonymizedGames: 0,
      done: false,
    });
    expect(await logOf(old.id)).toBeDefined();
    await runDailyRetention(db);
  });
});

describe("daily task: game identifiers (beta-hardening spec §2)", () => {
  it("games older than 30 days, with or without an account, lose anon_id and ip_hash; recent ones do not change", async () => {
    const userId = await newUser();
    const anonymousOld = await oldGame({ days: 31, log: null });
    const userOld = await oldGame({ days: 31, userId, log: null });
    const anonymousRecent = await oldGame({ days: 29, log: null });
    const userRecent = await oldGame({ days: 29, userId, log: null });

    await runDailyRetention(db);

    expect(await gameRow(anonymousOld.id)).toMatchObject({ anonId: null, ipHash: null, wpm: anonymousOld.wpm });
    expect(await gameRow(userOld.id)).toMatchObject({
      anonId: null,
      ipHash: null,
      userId,
      wpm: userOld.wpm,
      accuracy: 97.5,
    });
    for (const recent of [anonymousRecent, userRecent]) {
      expect(await gameRow(recent.id)).toMatchObject({ anonId: expect.any(String), ipHash: "a".repeat(64) });
    }
  });
});
