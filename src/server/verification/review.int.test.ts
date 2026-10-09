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

// Each test starts with empty rankings.
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

/** A player's best in English (touch keyboard unless stated otherwise), with its game (`bests.game_id` is required). */
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

describe("ranking position (PostgreSQL)", () => {
  it("counts only other active players of that language and keyboard who are ahead", async () => {
    const player = await newUser();
    const game = { ...candidate(player), userId: player };
    expect(await boardStanding(db, game, scoreOf(50))).toEqual({ ownScore: null, ahead: 0, verifiedWpm: null });

    for (let i = 0; i < 3; i++) await seedBest(await newUser(), 60);
    await seedBest(await newUser("shadowbanned"), 70);
    await seedBest(await newUser(), 40);
    await seedBest(await newUser(), 90, "physical");

    expect(await boardStanding(db, game, scoreOf(50))).toMatchObject({ ahead: 3 });
  });

  it("with a better own best, counts from that best and returns it", async () => {
    const player = await newUser();
    await seedBest(await newUser(), 60);
    await seedBest(player, 80);
    expect(await boardStanding(db, { ...candidate(player), userId: player }, scoreOf(50))).toEqual({
      ownScore: scoreOf(80),
      ahead: 0,
      verifiedWpm: null,
    });
  });

  it("returns their verified level for that language and keyboard", async () => {
    const player = await newUser();
    await db.insert(verifiedLevels).values([
      { userId: player, language: "en", inputType: "touch", wpm: 72.5 },
      { userId: player, language: "en", inputType: "physical", wpm: 300 },
    ]);
    expect(await boardStanding(db, { ...candidate(player), userId: player }, 1)).toMatchObject({ verifiedWpm: 72.5 });
  });
});

describe("decideReview (PostgreSQL)", () => {
  it("without a level and in the top 10: review, with the position it would have", async () => {
    for (let i = 0; i < 2; i++) await seedBest(await newUser(), 60);
    expect(await decideReview(db, candidate(await newUser()))).toEqual({ rank: 3 });
  });

  it("with 10 active players ahead, no", async () => {
    for (let i = 0; i < 10; i++) await seedBest(await newUser(), 60);
    expect(await decideReview(db, candidate(await newUser()))).toBeNull();
  });

  it("below their level × 1.10, no", async () => {
    const player = await newUser();
    await db.insert(verifiedLevels).values({ userId: player, language: "en", inputType: "touch", wpm: 50 });
    expect(await decideReview(db, candidate(player, 55))).toBeNull();
    expect(await decideReview(db, candidate(player, 55.01))).not.toBeNull();
  });

  it("if it does not improve their best, no", async () => {
    const player = await newUser("shadowbanned");
    await seedBest(player, 90);
    expect(await decideReview(db, candidate(player, 50))).toBeNull();
  });
});
