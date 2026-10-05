import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { games, keystrokeLogs } from "./schema";

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

describe("esquema de la base de datos", () => {
  it("las migraciones crean games y keystroke_logs", async () => {
    const row = game();
    await db.insert(games).values(row);
    await db.insert(keystrokeLogs).values({ gameId: row.id, events: Buffer.from("x") });
  });

  it("rechaza idiomas, tipos de teclado y veredictos fuera de la lista", async () => {
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

  it("no admite pulsaciones de una partida que no existe", async () => {
    await expect(db.insert(keystrokeLogs).values({ gameId: randomUUID(), events: Buffer.from("x") })).rejects.toMatchObject({
      cause: { constraint_name: "keystroke_logs_game_id_games_id_fk" },
    });
  });
});
