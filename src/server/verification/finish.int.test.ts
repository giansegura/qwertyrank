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

/** Como en producción, con 1,5 s de partida y sin cuenta atrás. */
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
/** 3 palabras en 1,5 s: 120 PPM, 100 % de precisión, teclado físico. */
const FAST = typed("hola ".repeat(3), { every: 50, hold: 30 });
/** 1 palabra: 40 PPM. */
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

/** Gasta un intento y empieza la partida de verificación, como `POST /api/game/start`. */
async function startVerification(userId: string, verificationId: string, using = service) {
  const spent = await spendAttempt(db, { verificationId, userId, language: "en" });
  if (!spent) throw new Error("sin intentos");
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

/** Una partida de verificación ya jugada y puntuada, lista para `createSaveVerificationGame`. */
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

describe("partida de verificación (spec 4b §3)", () => {
  it("superada: publica el récord, sube el nivel, cierra la verificación y responde con su posición", async () => {
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

    // La partida de verificación se guarda con su modo y su verificación, sin marcas propias.
    const [played] = await db
      .select()
      .from(games)
      .where(and(eq(games.verificationId, verification.id), eq(games.mode, "verification")));
    expect(played).toMatchObject({ verdict: "valid", wpm: 120, userId });
    expect((await bestsOf(userId)).map((best) => best.gameId)).not.toContain(played.id);
  });

  it("un récord de hace días entra en el ranking con su hora original, sin caducidad en Redis", async () => {
    const userId = await newUser();
    const lastNight = new Date(Date.now() - DAY_MS);
    const longAgo = new Date(Date.now() - 9 * DAY_MS);
    // La partida del récord, de anoche, y otras dos que esperaban la misma verificación, más lentas.
    const { gameId, verification } = await seedPendingVerification(db, userId, { startsAt: lastNight });
    const old = await seedPendingVerification(db, userId, { startsAt: longAgo, wpm: 80 });
    const recent = await seedPendingVerification(db, userId, { startsAt: new Date(Date.now() - 2 * DAY_MS), wpm: 90 });
    expect([old.verification.id, recent.verification.id]).toEqual([verification.id, verification.id]);

    const response = await verify(userId, verification.id, FAST);

    const position = await store.position(BOARD, userId);
    expect(position).not.toBeNull();
    expect(response.verification).toEqual({ kind: "verified", ranking: { kind: "ranked", rank: position, improved: true } });
    // Las tres pasan a `valid`; la marca es la más rápida, con la hora en que se jugó.
    for (const game of [gameId, old.gameId, recent.gameId]) expect(await verdictOf(game)).toBe("valid");
    expect(await bestsOf(userId)).toEqual([{ gameId, wpm: 100, achievedAt: lastNight }]);
    expect(await redis.ttl(boardKey(prefix, BOARD))).toBe(-1);
  });

  it("no superada: siguen pendientes los intentos que quedan; al tercero, fallida y el récord sigue en review", async () => {
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

  it("con otro teclado no cuenta, aunque llegue a las PPM", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { inputType: "touch" });
    expect((await verify(userId, verification.id, FAST)).verification).toEqual({
      kind: "failed",
      requiredWpm: 85,
      attemptsLeft: 2,
    });
  });

  it("si el objetivo sube a mitad de intento, se juzga contra el de ahora", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { wpm: 100 });
    const playing = await startVerification(userId, verification.id);
    // Mientras juega, otra partida mejor (p. ej. en otro dispositivo) pasa a ser el objetivo.
    await seedPendingVerification(db, userId, { wpm: 150 });

    expect((await finishVerification(playing, FAST)).verification).toEqual({
      kind: "failed",
      requiredWpm: 127.5,
      attemptsLeft: 2,
    });
  });

  it("si el objetivo cambia mientras el final espera a la verificación, se juzga contra el nuevo", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { wpm: 100 });
    const spent = await spendAttempt(db, { verificationId: verification.id, userId, language: "en" });
    const faster = played(userId, 150);

    // A: una partida mejor (p. ej. en otro dispositivo) pasa a ser el objetivo, y A no confirma hasta que
    // el final de la partida de verificación está esperando por esa verificación.
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
      // 120 PPM no llegan al 85 % de las 150 del objetivo nuevo: queda un intento menos, nada más.
      expect(await finished).toEqual({ kind: "failed", requiredWpm: 127.5, attemptsLeft: 2 });
    } finally {
      release();
    }
    expect(await verificationRow(verification.id)).toMatchObject({ gameId: faster.id, status: "pending", attempts: 1 });
    expect(await db.select({ id: games.id }).from(games).where(eq(games.id, game.id))).toHaveLength(1);
  });

  it("desde otro dispositivo: empezar allí cierra la partida de aquí, y cada inicio gasta su intento", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    const here = await startVerification(userId, verification.id);
    const there = await startVerification(userId, verification.id);

    await sleep(500);
    expect(await service.finish({ ...here, lastSeq: 0, ipHash: null })).toEqual({ kind: "closed" });
    expect((await finishVerification(there, FAST)).verification.kind).toBe("verified");
    expect(await verificationRow(verification.id)).toMatchObject({ status: "verified", attempts: 2 });
  });

  it("ya verificada desde otro dispositivo, un final que no llega no la cierra ni la publica otra vez", async () => {
    const userId = await newUser();
    const { gameId, verification } = await seedPendingVerification(db, userId);
    const saveVerificationGame = createSaveVerificationGame(db);

    const passed = await saveVerificationGame(played(userId, 120), { id: verification.id, attempt: 2 });
    expect(passed).toMatchObject({ kind: "verified", published: [{ gameId }] });
    // El tercer intento, en el otro dispositivo, termina después y no llega a las PPM.
    const late = await saveVerificationGame(played(userId, 40), { id: verification.id, attempt: 3 });
    expect(late).toMatchObject({ kind: "verified", target: { gameId }, published: [] });
    expect(await verificationRow(verification.id)).toMatchObject({ status: "verified" });
    expect(await verdictOf(gameId)).toBe("valid");
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId })]);
  });

  it("si borra la cuenta a mitad de intento, no hay nada que verificar: fallida y sin guardar la partida", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    const playing = await startVerification(userId, verification.id);
    // Mientras juega, borra la cuenta: su verificación cae en cascada.
    await db.delete(users).where(eq(users.id, userId));

    expect((await finishVerification(playing, FAST)).verification).toEqual({
      kind: "failed",
      requiredWpm: 0,
      attemptsLeft: 0,
    });
    expect(await db.select({ id: games.id }).from(games).where(eq(games.id, playing.gameId))).toEqual([]);
  });

  it("en shadow-ban sigue el mismo flujo: se publica en PostgreSQL, pero no entra en Redis", async () => {
    const userId = await newUser("shadowbanned");
    const { gameId, verification } = await seedPendingVerification(db, userId);
    expect((await verify(userId, verification.id, FAST)).verification).toMatchObject({
      kind: "verified",
      ranking: { kind: "ranked", rank: expect.any(Number), improved: true },
    });
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId })]);
    expect(await store.position(BOARD, userId)).toBeNull();
  });

  it("con Redis caído, el récord queda publicado en PostgreSQL y la respuesta lo dice", async () => {
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
