import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { emptyBoards } from "@/test/empty-boards";
import { createDb } from "../db/client";
import { bests, games, users } from "../db/schema";
import { encodeScore } from "./score";
import type { Board } from "./store";
import { getTop } from "./top";

const db = createDb(process.env.DATABASE_URL!);
const AT = new Date("2026-10-04T12:00:00Z");
const BOARD: Board = { language: "pt", inputType: "touch" };

// Each test starts with an empty ranking.
beforeEach(async () => {
  await emptyBoards(db);
});

afterAll(async () => {
  await db.$client.end();
});

async function best(nick: string, wpm: number, { status = "active" as "active" | "shadowbanned", board = BOARD } = {}) {
  const [user] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick, country: "BR", status })
    .returning({ id: users.id });
  const gameId = randomUUID();
  await db.insert(games).values({
    id: gameId,
    userId: user.id,
    anonId: null,
    language: board.language,
    inputType: board.inputType,
    wpm,
    rawWpm: wpm,
    accuracy: 95,
    verdict: "valid",
    startsAt: AT,
    finishedAt: AT,
  });
  await db.insert(bests).values({
    userId: user.id,
    language: board.language,
    inputType: board.inputType,
    gameId,
    wpm,
    accuracy: 95,
    score: encodeScore({ wpm, accuracy: 95, achievedAt: AT }),
    achievedAt: AT,
  });
}

const nick = (base: string) => `${base}_${randomUUID().slice(0, 6)}`;

describe("top of a ranking (PostgreSQL)", () => {
  it("orders by score and numbers from 1", async () => {
    const [slow, fast, mid] = [nick("slow"), nick("fast"), nick("mid")];
    await best(slow, 80);
    await best(fast, 100);
    await best(mid, 90);
    const top = await getTop(db, BOARD);
    expect(top.map((entry) => [entry.rank, entry.nick, entry.wpm])).toEqual([
      [1, fast, 100],
      [2, mid, 90],
      [3, slow, 80],
    ]);
    expect(top[0]).toMatchObject({ country: "BR", accuracy: 95 });
  });

  it("does not show shadow-banned players", async () => {
    const visible = nick("visible");
    await best(visible, 60);
    await best(nick("hidden"), 200, { status: "shadowbanned" });
    expect((await getTop(db, BOARD)).map((entry) => entry.nick)).toEqual([visible]);
  });

  it("only the bests of that language and keyboard", async () => {
    const here = nick("here");
    await best(here, 60);
    await best(nick("touch_en"), 90, { board: { language: "en", inputType: "touch" } });
    await best(nick("phys_pt"), 90, { board: { language: "pt", inputType: "physical" } });
    expect((await getTop(db, BOARD)).map((entry) => entry.nick)).toEqual([here]);
  });

  it("respects the limit", async () => {
    for (const wpm of [50, 60, 70]) await best(nick("n"), wpm);
    expect(await getTop(db, BOARD, 2)).toHaveLength(2);
  });
});
