import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import { createSaveGame, type GameRecord } from "./persist";

const db = createDb(process.env.DATABASE_URL!);
const saveGame = createSaveGame(db);

afterAll(async () => {
  await db.$client.end();
});

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: randomUUID(),
    userId: null,
    anonId: randomUUID(),
    language: "pt",
    inputType: "touch",
    wpm: 61.5,
    rawWpm: 64,
    accuracy: 97.25,
    verdict: "valid",
    rejectReason: null,
    ipHash: "a".repeat(64),
    startsAt: new Date("2026-10-05T10:00:00Z"),
    finishedAt: new Date("2026-10-05T10:00:31Z"),
    batches: [{ seq: 1, arrivedAt: 123, events: [{ t: 0, type: "input", deleted: 0, inserted: "a", trusted: true }] }],
    ...overrides,
  };
}

describe("saveGame (PostgreSQL)", () => {
  it("guarda la partida y su registro de pulsaciones comprimido", async () => {
    const input = record();
    await saveGame(input);

    const [game] = await db.select().from(games).where(eq(games.id, input.id));
    expect(game).toMatchObject({ language: "pt", inputType: "touch", wpm: 61.5, verdict: "valid", anonId: input.anonId });

    const [log] = await db.select().from(keystrokeLogs).where(eq(keystrokeLogs.gameId, input.id));
    expect(JSON.parse(gunzipSync(log.events).toString("utf8"))).toEqual(input.batches);
  });

  it("guarda también las partidas rechazadas con su motivo", async () => {
    const input = record({ verdict: "rejected", rejectReason: "untrusted" });
    await saveGame(input);
    const [game] = await db.select().from(games).where(eq(games.id, input.id));
    expect(game.rejectReason).toBe("untrusted");
  });

  it("no guarda dos veces la misma partida", async () => {
    const input = record();
    await saveGame(input);
    await expect(saveGame({ ...input, id: input.id })).rejects.toThrow();
    const rows = await db.select().from(games).where(eq(games.id, input.id));
    expect(rows).toHaveLength(1);
  });
});
