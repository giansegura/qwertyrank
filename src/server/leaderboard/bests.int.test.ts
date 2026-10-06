import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { games, periodBests, users } from "../db/schema";
import { recordBests } from "./bests";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

const AT = new Date("2026-10-04T23:59:30Z");

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `b_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  return row.id;
}

async function newGame(userId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(games).values({
    id,
    userId,
    anonId: randomUUID(),
    language: "es",
    inputType: "physical",
    wpm: 1,
    rawWpm: 1,
    accuracy: 100,
    verdict: "valid",
    startsAt: AT,
    finishedAt: AT,
  });
  return id;
}

function entry(userId: string, gameId: string, wpm: number, accuracy: number, achievedAt = AT) {
  return { userId, gameId, language: "es" as const, inputType: "physical" as const, wpm, accuracy, achievedAt };
}

describe("recordBests (period_bests)", () => {
  it("la primera partida es la marca de los 5 periodos en que se jugó (23:59 UTC → ese día)", async () => {
    const userId = await newUser();
    const improved = await recordBests(db, entry(userId, await newGame(userId), 80, 97));
    expect(improved.map(({ period, key }) => [period, key]).toSorted()).toEqual([
      ["all", "all"],
      ["day", "2026-10-04"],
      ["month", "2026-10"],
      ["week", "2026-W40"],
      ["year", "2026"],
    ]);
  });

  it("una partida peor no cambia la marca", async () => {
    const userId = await newUser();
    const first = await newGame(userId);
    await recordBests(db, entry(userId, first, 80, 97));
    expect(await recordBests(db, entry(userId, await newGame(userId), 79, 100))).toEqual([]);
    const rows = await db.select({ gameId: periodBests.gameId }).from(periodBests).where(eq(periodBests.userId, userId));
    expect(rows.every((row) => row.gameId === first)).toBe(true);
  });

  it("a igualdad, se queda la que llegó antes", async () => {
    const userId = await newUser();
    // Las dos el mismo día (AT es casi medianoche: 5 minutos después ya sería otro día y otra semana).
    const earlier = new Date("2026-10-04T12:00:00Z");
    const later = new Date("2026-10-04T12:05:00Z");
    await recordBests(db, entry(userId, await newGame(userId), 80, 97, earlier));
    expect(await recordBests(db, entry(userId, await newGame(userId), 80, 97, later))).toEqual([]);
  });

  it("una partida mejor sustituye a la anterior en sus 5 periodos", async () => {
    const userId = await newUser();
    await recordBests(db, entry(userId, await newGame(userId), 80, 97));
    const better = await newGame(userId);
    expect(await recordBests(db, entry(userId, better, 85, 96))).toHaveLength(5);
    const rows = await db.select().from(periodBests).where(eq(periodBests.userId, userId));
    expect(rows.every((row) => row.gameId === better && row.wpm === 85)).toBe(true);
  });

  it("una partida peor de otro día solo crea las marcas de sus periodos nuevos", async () => {
    const userId = await newUser();
    await recordBests(db, entry(userId, await newGame(userId), 80, 97));
    const monday = new Date("2026-10-05T10:00:00Z");
    const improved = await recordBests(db, entry(userId, await newGame(userId), 60, 95, monday));
    expect(improved.map(({ period, key }) => [period, key]).toSorted()).toEqual([
      ["day", "2026-10-05"],
      ["week", "2026-W41"],
    ]);
  });
});
