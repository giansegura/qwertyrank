import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { games, keystrokeLogs, users } from "./schema";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

function game() {
  return {
    id: randomUUID(),
    language: "es" as const,
    inputType: "physical" as const,
    wpm: 50,
    rawWpm: 52,
    accuracy: 98,
    verdict: "valid" as const,
    startsAt: new Date(),
    finishedAt: new Date(),
  };
}

function user(nick: string) {
  return { name: "", email: `${randomUUID()}@example.com`, nick };
}

describe("database schema", () => {
  it("the migrations create games and keystroke_logs", async () => {
    const row = game();
    await db.insert(games).values(row);
    await db.insert(keystrokeLogs).values({ gameId: row.id, events: Buffer.from("x") });
  });

  it("rejects languages, keyboard types and verdicts outside the list", async () => {
    await expect(db.insert(games).values({ ...game(), language: "fr" as "es" })).rejects.toMatchObject({
      cause: { constraint_name: "games_language_check" },
    });
    await expect(db.insert(games).values({ ...game(), inputType: "mouse" as "touch" })).rejects.toMatchObject({
      cause: { constraint_name: "games_input_type_check" },
    });
    await expect(db.insert(games).values({ ...game(), verdict: "maybe" as "valid" })).rejects.toMatchObject({
      cause: { constraint_name: "games_verdict_check" },
    });
  });

  it("does not accept keystrokes for a game that does not exist", async () => {
    await expect(db.insert(keystrokeLogs).values({ gameId: randomUUID(), events: Buffer.from("x") })).rejects.toMatchObject({
      cause: { constraint_name: "keystroke_logs_game_id_games_id_fk" },
    });
  });

  it("the nick is unique case-insensitively", async () => {
    const nick = `Nick_${randomUUID().slice(0, 8)}`;
    await db.insert(users).values(user(nick));
    await expect(db.insert(users).values(user(nick.toLowerCase()))).rejects.toMatchObject({
      cause: { constraint_name: "users_nick_lower_idx" },
    });
  });

  it("when a user is deleted, their games are left without a user", async () => {
    const [created] = await db
      .insert(users)
      .values(user(`u_${randomUUID().slice(0, 8)}`))
      .returning({ id: users.id });
    const row = { ...game(), userId: created.id };
    await db.insert(games).values(row);
    await db.delete(users).where(eq(users.id, created.id));
    const [after] = await db.select({ userId: games.userId }).from(games).where(eq(games.id, row.id));
    expect(after.userId).toBeNull();
  });
});
