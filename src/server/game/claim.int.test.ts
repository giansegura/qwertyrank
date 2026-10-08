import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { emptyBoards } from "@/test/empty-boards";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { bests, games, recordVerifications, users } from "../db/schema";
import { createRanking } from "../leaderboard/ranking";
import { createLeaderboardStore } from "../leaderboard/store";
import { createRedis } from "../redis";
import { createClaimGame } from "./claim";
import { createSaveGame, type GameRecord } from "./persist";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}claim-${randomUUID().slice(0, 8)}:`;
const ranking = createRanking({ db, store: createLeaderboardStore(redis, prefix), onTopChanged: () => {} });
const claimGame = createClaimGame({ db, rankGame: ranking.rankGame });
const saveGame = createSaveGame(db);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

async function newUser({ verified = true } = {}): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `c_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  if (verified) await verifyEverywhere(db, row.id);
  return row.id;
}

/** Partida anónima terminada hace `minutesAgo` minutos. */
async function anonymousGame(overrides: Partial<GameRecord> = {}, minutesAgo = 1) {
  const finishedAt = new Date(Date.now() - minutesAgo * 60_000);
  const record: GameRecord = {
    id: randomUUID(),
    userId: null,
    anonId: randomUUID(),
    language: "es",
    inputType: "physical",
    wpm: 70,
    rawWpm: 72,
    accuracy: 97,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt: new Date(finishedAt.getTime() - 33_000),
    finishedAt,
    words: [],
    batches: [],
    ...overrides,
  };
  await saveGame(record);
  return record;
}

async function owner(gameId: string) {
  const [row] = await db.select({ userId: games.userId, claimedAt: games.claimedAt }).from(games).where(eq(games.id, gameId));
  return row;
}

describe("reclamar una partida anónima (spec §3.7)", () => {
  it("una partida reciente pasa al usuario y es su marca, con la hora en que se jugó", async () => {
    const userId = await newUser();
    const game = await anonymousGame();
    const outcome = await claimGame({ gameId: game.id, anonId: game.anonId, userId });
    expect(outcome).toMatchObject({
      kind: "ok",
      claim: { language: "es", inputType: "physical", ranking: { kind: "ranked", rank: expect.any(Number), improved: true } },
    });
    expect(await owner(game.id)).toMatchObject({ userId, claimedAt: expect.any(Date) });
    expect(await db.select().from(bests).where(eq(bests.gameId, game.id))).toEqual([
      expect.objectContaining({ userId, language: "es", inputType: "physical", achievedAt: game.startsAt }),
    ]);
  });

  it("pasados 10 minutos ya no se puede", async () => {
    const game = await anonymousGame({}, 11);
    expect(await claimGame({ gameId: game.id, anonId: game.anonId, userId: await newUser() })).toEqual({ kind: "expired" });
    expect((await owner(game.id)).userId).toBeNull();
  });

  it("desde otro navegador (otro anon_id) no se encuentra", async () => {
    const game = await anonymousGame();
    expect(await claimGame({ gameId: game.id, anonId: randomUUID(), userId: await newUser() })).toEqual({
      kind: "not_found",
    });
  });

  it("repetir el reclamo no cambia nada", async () => {
    const userId = await newUser();
    const game = await anonymousGame();
    await claimGame({ gameId: game.id, anonId: game.anonId, userId });
    expect(await claimGame({ gameId: game.id, anonId: game.anonId, userId })).toMatchObject({
      kind: "ok",
      claim: { ranking: { kind: "ranked", improved: false } },
    });
  });

  it("otro usuario del mismo navegador no puede quitársela", async () => {
    const game = await anonymousGame();
    await claimGame({ gameId: game.id, anonId: game.anonId, userId: await newUser() });
    expect(await claimGame({ gameId: game.id, anonId: game.anonId, userId: await newUser() })).toEqual({
      kind: "not_found",
    });
  });

  it("una partida rechazada no se reclama", async () => {
    const game = await anonymousGame({ verdict: "rejected", rejectReason: "untrusted" });
    expect(await claimGame({ gameId: game.id, anonId: game.anonId, userId: await newUser() })).toEqual({
      kind: "not_found",
    });
  });

  it("con menos del 90 % de precisión se guarda en la cuenta, pero sin ranking", async () => {
    const userId = await newUser();
    const game = await anonymousGame({ accuracy: 85 });
    expect(await claimGame({ gameId: game.id, anonId: game.anonId, userId })).toMatchObject({
      kind: "ok",
      claim: { ranking: { kind: "low_accuracy" } },
    });
    expect((await owner(game.id)).userId).toBe(userId);
  });

  it("si entraría en un top 10 sin verificar, el reclamo la deja en review con su verificación", async () => {
    await emptyBoards(db);
    const userId = await newUser({ verified: false });
    const game = await anonymousGame({ wpm: 80 });

    const outcome = await claimGame({ gameId: game.id, anonId: game.anonId, userId });
    expect(outcome).toMatchObject({
      kind: "ok",
      claim: {
        language: "es",
        inputType: "physical",
        ranking: { kind: "review", rank: 1, verification: { targetWpm: 80, requiredWpm: 68, attemptsLeft: 3 } },
      },
    });
    const [row] = await db.select().from(games).where(eq(games.id, game.id));
    expect(row).toMatchObject({ userId, verdict: "review", verificationId: expect.any(String) });
    expect(await db.select().from(bests).where(eq(bests.gameId, game.id))).toEqual([]);

    // Repetir el reclamo (p. ej. al recargar la página) enseña la misma verificación…
    const again = await claimGame({ gameId: game.id, anonId: game.anonId, userId });
    expect(again).toMatchObject({ kind: "ok", claim: { ranking: { kind: "review", rank: 1, verification: { id: row.verificationId } } } });
    // …y, si ha caducado, ya no hay nada que verificar.
    await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(recordVerifications.id, row.verificationId!));
    expect(await claimGame({ gameId: game.id, anonId: game.anonId, userId })).toMatchObject({
      kind: "ok",
      claim: { ranking: { kind: "unranked" } },
    });
  });
});
