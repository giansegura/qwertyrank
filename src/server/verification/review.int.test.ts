import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PERIODS, periodKey } from "@/lib/leaderboard/periods";
import { createDb } from "../db/client";
import { games, periodBests, users, verifiedLevels } from "../db/schema";
import { encodeScore } from "../leaderboard/score";
import type { Board } from "../leaderboard/store";
import { boardStandings, decideReview, type ReviewCandidate } from "./review";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

/**
 * Un día que ninguna otra prueba usa: sus rankings de día, semana y mes empiezan vacíos. Pasado 2057
 * los minutos de la puntuación ya no cuentan, así que lo que decide es la velocidad.
 */
function freshDay(): Date {
  return new Date(Date.UTC(randomInt(2100, 9999), randomInt(0, 12), randomInt(1, 29), 12));
}

async function newUser(status: "active" | "shadowbanned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `rv_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

/** La marca de un jugador en un ranking, con su partida (`period_bests.game_id` es obligatorio). */
async function seedBest(userId: string, board: Board, wpm: number, at: Date) {
  const gameId = randomUUID();
  await db.insert(games).values({
    id: gameId,
    userId,
    language: board.language,
    inputType: board.inputType,
    wpm,
    rawWpm: wpm,
    accuracy: 100,
    verdict: "valid",
    startsAt: at,
    finishedAt: at,
  });
  await db.insert(periodBests).values({
    userId,
    language: board.language,
    inputType: board.inputType,
    periodType: board.period,
    periodKey: board.key,
    gameId,
    wpm,
    accuracy: 100,
    score: encodeScore({ wpm, accuracy: 100, achievedAt: at }),
    achievedAt: at,
  });
}

const candidate = (userId: string, startsAt: Date, wpm = 50): ReviewCandidate => ({
  userId,
  language: "en",
  inputType: "touch",
  verdict: "valid",
  wpm,
  accuracy: 100,
  startsAt,
});
const boardAt = (period: Board["period"], at: Date): Board => ({
  language: "en",
  inputType: "touch",
  period,
  key: periodKey(period, at),
});
const aheadIn = (standings: Awaited<ReturnType<typeof boardStandings>>, period: string) =>
  standings.boards.find((board) => board.period === period)?.ahead;

describe("posiciones en los rankings abiertos (PostgreSQL)", () => {
  it("cuenta solo a otros jugadores activos que van por delante", async () => {
    const day = freshDay();
    const player = await newUser();
    const game = candidate(player, day);
    const score = encodeScore({ wpm: 50, accuracy: 100, achievedAt: day });
    const before = await boardStandings(db, { ...game, userId: player }, score, day);
    expect(before.boards.map((board) => board.period)).toEqual(["day", "week", "month", "all"]);
    expect(aheadIn(before, "day")).toBe(0);

    for (const period of ["day", "all"] as const) {
      for (let i = 0; i < 3; i++) await seedBest(await newUser(), boardAt(period, day), 60, day);
      await seedBest(await newUser("shadowbanned"), boardAt(period, day), 70, day);
      await seedBest(await newUser(), boardAt(period, day), 40, day);
    }

    const after = await boardStandings(db, { ...game, userId: player }, score, day);
    expect(aheadIn(after, "day")).toBe(3);
    expect(aheadIn(after, "all")).toBe(aheadIn(before, "all")! + 3);
    expect(after.verifiedWpm).toBeNull();
  });

  it("con marca propia mejor, cuenta desde su marca y la devuelve", async () => {
    const day = freshDay();
    const player = await newUser();
    await seedBest(await newUser(), boardAt("day", day), 60, day);
    await seedBest(player, boardAt("day", day), 80, day);
    const score = encodeScore({ wpm: 50, accuracy: 100, achievedAt: day });
    const standings = await boardStandings(db, { ...candidate(player, day), userId: player }, score, day);
    const today = standings.boards.find((board) => board.period === "day")!;
    expect(today).toEqual({ period: "day", ownScore: encodeScore({ wpm: 80, accuracy: 100, achievedAt: day }), ahead: 0 });
  });

  it("devuelve su nivel verificado de ese idioma y teclado", async () => {
    const day = freshDay();
    const player = await newUser();
    await db.insert(verifiedLevels).values([
      { userId: player, language: "en", inputType: "touch", wpm: 72.5 },
      { userId: player, language: "en", inputType: "physical", wpm: 300 },
    ]);
    const standings = await boardStandings(db, { ...candidate(player, day), userId: player }, 1, day);
    expect(standings.verifiedWpm).toBe(72.5);
  });
});

describe("decideReview (PostgreSQL)", () => {
  it("sin nivel y entre los 10 primeros: review, con su posición en cada ranking abierto", async () => {
    const day = freshDay();
    expect(await decideReview(db, candidate(await newUser(), day), day)).toEqual({
      ranks: { day: 1, week: 1, month: 1, all: expect.any(Number) },
    });
  });

  it("por debajo de su nivel × 1,10, no", async () => {
    const day = freshDay();
    const player = await newUser();
    await db.insert(verifiedLevels).values({ userId: player, language: "en", inputType: "touch", wpm: 50 });
    expect(await decideReview(db, candidate(player, day, 55), day)).toBeNull();
    expect(await decideReview(db, candidate(player, day, 55.01), day)).not.toBeNull();
  });

  it("si no mejora su marca en ningún ranking abierto, no", async () => {
    const day = freshDay();
    const player = await newUser("shadowbanned");
    for (const period of PERIODS) await seedBest(player, boardAt(period, day), 90, day);
    expect(await decideReview(db, candidate(player, day, 50), day)).toBeNull();
  });
});
