import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { games, periodBests, users } from "../db/schema";
import { encodeScore } from "./score";
import type { Board } from "./store";
import { getTop } from "./top";

const db = createDb(process.env.DATABASE_URL!);
const AT = new Date("2026-10-04T12:00:00Z");

afterAll(async () => {
  await db.$client.end();
});

/** Un ranking propio en cada test: una clave de periodo inventada que nadie más usa. */
function freshBoard(): Board {
  return { language: "pt", inputType: "touch", period: "day", key: `t-${randomUUID()}` };
}

async function best(board: Board, nick: string, wpm: number, status: "active" | "shadowbanned" = "active") {
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
  await db.insert(periodBests).values({
    userId: user.id,
    language: board.language,
    inputType: board.inputType,
    periodType: board.period,
    periodKey: board.key,
    gameId,
    wpm,
    accuracy: 95,
    score: encodeScore({ wpm, accuracy: 95, achievedAt: AT }),
    achievedAt: AT,
  });
}

const nick = (base: string) => `${base}_${randomUUID().slice(0, 6)}`;

describe("top de un ranking (PostgreSQL)", () => {
  it("ordena por puntuación y numera desde 1", async () => {
    const board = freshBoard();
    const [slow, fast, mid] = [nick("slow"), nick("fast"), nick("mid")];
    await best(board, slow, 80);
    await best(board, fast, 100);
    await best(board, mid, 90);
    const top = await getTop(db, board);
    expect(top.map((entry) => [entry.rank, entry.nick, entry.wpm])).toEqual([
      [1, fast, 100],
      [2, mid, 90],
      [3, slow, 80],
    ]);
    expect(top[0]).toMatchObject({ country: "BR", accuracy: 95 });
  });

  it("no enseña a jugadores en shadow-ban", async () => {
    const board = freshBoard();
    const visible = nick("visible");
    await best(board, visible, 60);
    await best(board, nick("hidden"), 200, "shadowbanned");
    expect((await getTop(db, board)).map((entry) => entry.nick)).toEqual([visible]);
  });

  it("respeta el límite", async () => {
    const board = freshBoard();
    for (const wpm of [50, 60, 70]) await best(board, nick("n"), wpm);
    expect(await getTop(db, board, 2)).toHaveLength(2);
  });
});
