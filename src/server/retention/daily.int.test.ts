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

/** Las pulsaciones de "hola": down/input/up por letra, 120 ms entre letras. */
const EVENTS: TypingEvent[] = [..."hola"].flatMap((char, i): TypingEvent[] => [
  { t: i * 120, type: "down", key: char, code: `Key${char.toUpperCase()}`, trusted: true },
  { t: i * 120 + 1, type: "input", deleted: 0, inserted: char, trusted: true },
  { t: i * 120 + 70, type: "up", key: char, code: `Key${char.toUpperCase()}`, trusted: true },
]);

/** Unas PPM que nadie más usa: así se encuentra el extracto de esta partida, que no guarda su id. */
const uniqueWpm = () => 50 + Math.random() * 1_000;

async function newUser(status: "active" | "shadowbanned" | "banned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `rt_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

/** Una partida terminada hace `days` días con su registro de pulsaciones de ese mismo momento. */
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

describe("tarea diaria: pulsaciones (spec 5a §3.2.1)", () => {
  it("a los 30 días guarda el extracto de ritmo, sin identificadores, y borra las pulsaciones", async () => {
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
      accuracy: 97.5,
      playedWeek: weekOf(old.startsAt),
      playerStatus: "active",
      ...rhythmOf(EVENTS),
      createdAt: expect.any(Date),
    });
    expect(await samplesWith(recent.wpm)).toEqual([]);
  });

  it("las pulsaciones de una mejor marca vigente se quedan, aunque tengan más de 30 días", async () => {
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

  it("la etiqueta es el estado del jugador, y anonymous si la partida no tiene", async () => {
    const shadow = await oldGame({ days: 31, userId: await newUser("shadowbanned") });
    const banned = await oldGame({ days: 31, userId: await newUser("banned") });
    const anonymous = await oldGame({ days: 31 });

    await runDailyRetention(db);

    expect((await samplesWith(shadow.wpm))[0].playerStatus).toBe("shadowbanned");
    expect((await samplesWith(banned.wpm))[0].playerStatus).toBe("banned");
    expect((await samplesWith(anonymous.wpm))[0].playerStatus).toBe("anonymous");
  });

  it("un registro ilegible o sin eventos se borra sin extracto", async () => {
    const broken = await oldGame({ days: 31, log: Buffer.from("no es gzip") });
    const empty = await oldGame({ days: 31, log: gzipSync(JSON.stringify({ words: ["hola"], batches: [] })) });

    await runDailyRetention(db);

    for (const game of [broken, empty]) {
      expect(await logOf(game.id)).toBeUndefined();
      expect(await samplesWith(game.wpm)).toEqual([]);
    }
  });

  it("un evento con un t fuera de rango no bloquea la tarea: se extrae con los tiempos acotados", async () => {
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

  it("por lotes, y dos ejecuciones a la vez no duplican ningún extracto", async () => {
    const wpm = uniqueWpm();
    const played = [];
    for (let i = 0; i < 5; i++) played.push(await oldGame({ days: 31 + i, wpm }));

    const reports = await Promise.all([runDailyRetention(db, { batchSize: 2 }), runDailyRetention(db, { batchSize: 2 })]);
    await runDailyRetention(db, { batchSize: 2 });

    expect(reports.every((report) => report.done)).toBe(true);
    expect(await samplesWith(wpm)).toHaveLength(5);
    for (const game of played) expect(await logOf(game.id)).toBeUndefined();
  });

  it("sin tiempo, no hace nada y dice que queda trabajo", async () => {
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

describe("tarea diaria: partidas anónimas (spec 5a §3.2.2)", () => {
  it("las anónimas de más de 30 días pierden anon_id e ip_hash; las demás no cambian", async () => {
    const anonymousOld = await oldGame({ days: 31, log: null });
    const anonymousRecent = await oldGame({ days: 29, log: null });
    const userOld = await oldGame({ days: 31, userId: await newUser(), log: null });

    await runDailyRetention(db);

    expect(await gameRow(anonymousOld.id)).toMatchObject({ anonId: null, ipHash: null, wpm: anonymousOld.wpm });
    expect(await gameRow(anonymousRecent.id)).toMatchObject({ anonId: expect.any(String), ipHash: "a".repeat(64) });
    expect(await gameRow(userOld.id)).toMatchObject({ anonId: expect.any(String), ipHash: "a".repeat(64) });
  });
});
