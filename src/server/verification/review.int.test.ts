import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { InputType } from "@/lib/game/types";
import { emptyBoards } from "@/test/empty-boards";
import { createDb } from "../db/client";
import { bests, games, users, verifiedLevels } from "../db/schema";
import { encodeScore } from "../leaderboard/score";
import { boardStanding, decideReview, type ReviewCandidate } from "./review";

const db = createDb(process.env.DATABASE_URL!);
const AT = new Date("2026-10-07T12:00:00Z");

// Cada test empieza con los rankings vacíos.
beforeEach(async () => {
  await emptyBoards(db);
});

afterAll(async () => {
  await db.$client.end();
});

async function newUser(status: "active" | "shadowbanned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `rv_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

/** La marca de un jugador en inglés (teclado táctil si no se dice otro), con su partida (`bests.game_id` es obligatorio). */
async function seedBest(userId: string, wpm: number, inputType: InputType = "touch") {
  const gameId = randomUUID();
  await db.insert(games).values({
    id: gameId,
    userId,
    language: "en",
    inputType,
    wpm,
    rawWpm: wpm,
    accuracy: 100,
    verdict: "valid",
    startsAt: AT,
    finishedAt: AT,
  });
  await db.insert(bests).values({
    userId,
    language: "en",
    inputType,
    gameId,
    wpm,
    accuracy: 100,
    score: encodeScore({ wpm, accuracy: 100, achievedAt: AT }),
    achievedAt: AT,
  });
}

const candidate = (userId: string, wpm = 50): ReviewCandidate => ({
  userId,
  language: "en",
  inputType: "touch",
  verdict: "valid",
  wpm,
  accuracy: 100,
  startsAt: AT,
});
const scoreOf = (wpm: number) => encodeScore({ wpm, accuracy: 100, achievedAt: AT });

describe("posición en el ranking (PostgreSQL)", () => {
  it("cuenta solo a otros jugadores activos de ese idioma y teclado que van por delante", async () => {
    const player = await newUser();
    const game = { ...candidate(player), userId: player };
    expect(await boardStanding(db, game, scoreOf(50))).toEqual({ ownScore: null, ahead: 0, verifiedWpm: null });

    for (let i = 0; i < 3; i++) await seedBest(await newUser(), 60);
    await seedBest(await newUser("shadowbanned"), 70);
    await seedBest(await newUser(), 40);
    await seedBest(await newUser(), 90, "physical");

    expect(await boardStanding(db, game, scoreOf(50))).toMatchObject({ ahead: 3 });
  });

  it("con marca propia mejor, cuenta desde su marca y la devuelve", async () => {
    const player = await newUser();
    await seedBest(await newUser(), 60);
    await seedBest(player, 80);
    expect(await boardStanding(db, { ...candidate(player), userId: player }, scoreOf(50))).toEqual({
      ownScore: scoreOf(80),
      ahead: 0,
      verifiedWpm: null,
    });
  });

  it("devuelve su nivel verificado de ese idioma y teclado", async () => {
    const player = await newUser();
    await db.insert(verifiedLevels).values([
      { userId: player, language: "en", inputType: "touch", wpm: 72.5 },
      { userId: player, language: "en", inputType: "physical", wpm: 300 },
    ]);
    expect(await boardStanding(db, { ...candidate(player), userId: player }, 1)).toMatchObject({ verifiedWpm: 72.5 });
  });
});

describe("decideReview (PostgreSQL)", () => {
  it("sin nivel y entre los 10 primeros: review, con la posición que tendría", async () => {
    for (let i = 0; i < 2; i++) await seedBest(await newUser(), 60);
    expect(await decideReview(db, candidate(await newUser()))).toEqual({ rank: 3 });
  });

  it("con 10 jugadores activos por delante, no", async () => {
    for (let i = 0; i < 10; i++) await seedBest(await newUser(), 60);
    expect(await decideReview(db, candidate(await newUser()))).toBeNull();
  });

  it("por debajo de su nivel × 1,10, no", async () => {
    const player = await newUser();
    await db.insert(verifiedLevels).values({ userId: player, language: "en", inputType: "touch", wpm: 50 });
    expect(await decideReview(db, candidate(player, 55))).toBeNull();
    expect(await decideReview(db, candidate(player, 55.01))).not.toBeNull();
  });

  it("si no mejora su marca, no", async () => {
    const player = await newUser("shadowbanned");
    await seedBest(player, 90);
    expect(await decideReview(db, candidate(player, 50))).toBeNull();
  });
});
