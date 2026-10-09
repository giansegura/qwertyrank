import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { bests, games, users } from "../db/schema";
import { recordBest } from "./bests";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

const AT = new Date("2026-10-04T12:00:00Z");

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

const bestsOf = (userId: string) => db.select().from(bests).where(eq(bests.userId, userId));

describe("recordBest (bests)", () => {
  it("the first game is their best in that language and keyboard", async () => {
    const userId = await newUser();
    const gameId = await newGame(userId);
    expect(await recordBest(db, entry(userId, gameId, 80, 97))).toBe(true);
    expect(await bestsOf(userId)).toEqual([
      expect.objectContaining({ language: "es", inputType: "physical", gameId, wpm: 80, accuracy: 97, achievedAt: AT }),
    ]);
  });

  it("a worse game does not change the best", async () => {
    const userId = await newUser();
    const first = await newGame(userId);
    await recordBest(db, entry(userId, first, 80, 97));
    expect(await recordBest(db, entry(userId, await newGame(userId), 79, 100))).toBe(false);
    expect((await bestsOf(userId)).map((row) => row.gameId)).toEqual([first]);
  });

  it("on a tie, the earlier one stays, even if it is from another day", async () => {
    const userId = await newUser();
    const first = await newGame(userId);
    await recordBest(db, entry(userId, first, 80, 97, AT));
    const nextWeek = new Date(AT.getTime() + 7 * 86_400_000);
    expect(await recordBest(db, entry(userId, await newGame(userId), 80, 97, nextWeek))).toBe(false);
    expect((await bestsOf(userId)).map((row) => row.gameId)).toEqual([first]);
  });

  it("a better game replaces the previous one", async () => {
    const userId = await newUser();
    await recordBest(db, entry(userId, await newGame(userId), 80, 97));
    const better = await newGame(userId);
    expect(await recordBest(db, entry(userId, better, 85, 96))).toBe(true);
    expect(await bestsOf(userId)).toEqual([expect.objectContaining({ gameId: better, wpm: 85, accuracy: 96 })]);
  });

  it("each language and keyboard has its own best", async () => {
    const userId = await newUser();
    await recordBest(db, entry(userId, await newGame(userId), 80, 97));
    expect(await recordBest(db, { ...entry(userId, await newGame(userId), 60, 95), inputType: "touch" })).toBe(true);
    expect(await recordBest(db, { ...entry(userId, await newGame(userId), 50, 95), language: "en" })).toBe(true);
    expect(await bestsOf(userId)).toHaveLength(3);
  });
});
