import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { typed } from "@/test/typing-events";
import { createDb } from "../db/client";
import { games } from "../db/schema";
import { createRedis } from "../redis";
import { createSaveGame } from "./persist";
import { createGameService } from "./service";
import { createGameStore } from "./store";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);

// Tiempos cortos para recorrer partidas completas en el test: sin cuenta atrás, 1,5 s de partida.
const service = createGameService({
  store: createGameStore(redis, process.env.REDIS_KEY_PREFIX!),
  saveGame: createSaveGame(db),
  loadWords: async () => ["hola"],
  random: Math.random,
  newId: randomUUID,
  times: { countdownMs: 0, durationMs: 1_500, graceMs: 500 },
});

const ENV = { coarse: false, touchPoints: 0 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterAll(async () => {
  await db.$client.end();
});

async function storedReason(gameId: string) {
  const [row] = await db.select({ reason: games.rejectReason }).from(games).where(eq(games.id, gameId));
  return row?.reason;
}

async function play(events: TypingEvent[], { waitBeforeSend = 400, waitBeforeFinish = 0 } = {}) {
  const owner = randomUUID();
  const { gameId, words } = await service.start({ owner, language: "es", env: ENV });
  await sleep(waitBeforeSend);
  expect(await service.appendKeys({ owner, gameId, seq: 1, events })).toBe("ok");
  await sleep(waitBeforeFinish);
  const outcome = await service.finish({ owner, gameId, lastSeq: 1, ipHash: null });
  return { owner, gameId, words, outcome };
}

describe("GameService (Redis + PostgreSQL)", () => {
  it("una partida honesta es válida, se puntúa en el servidor y se guarda", async () => {
    const { gameId, words, outcome } = await play(typed("hola ", { every: 50, hold: 30 }));
    expect(words.every((word) => word === "hola")).toBe(true);
    if (outcome.kind !== "ok") throw new Error(outcome.kind);
    expect(outcome.response).toMatchObject({ gameId, verdict: "valid", reason: null, inputType: "physical", correctChars: 5 });

    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    expect(row).toMatchObject({ verdict: "valid", wpm: outcome.response.wpm });
  });

  it("repetir el final devuelve el mismo resultado sin volver a guardarlo", async () => {
    const { owner, gameId, outcome } = await play(typed("hola ", { every: 50, hold: 30 }));
    const again = await service.finish({ owner, gameId, lastSeq: 1, ipHash: null });
    expect(again).toEqual(outcome);
  });

  it("rechaza eventos generados por código (isTrusted = false)", async () => {
    const events = typed("hola ", { every: 50, hold: 30 }).map((event) => ({ ...event, trusted: false }));
    const { gameId, outcome } = await play(events);
    // Al jugador solo le llega la categoría; la regla exacta se queda en la base de datos (spec §4.9).
    expect(outcome).toMatchObject({ kind: "ok", response: { verdict: "rejected", reason: "unrecognized" } });
    expect(await storedReason(gameId)).toBe("untrusted");
  });

  it("rechaza un registro con horas posteriores a su llegada", async () => {
    const { gameId, outcome } = await play(typed("hola ", { start: 1_000, every: 50, hold: 30 }), { waitBeforeSend: 50 });
    expect(outcome).toMatchObject({ kind: "ok", response: { verdict: "rejected", reason: "unrecognized" } });
    expect(await storedReason(gameId)).toBe("fabricated_timing");
  });

  it("rechaza un final que llega después de la hora límite", async () => {
    const { gameId, outcome } = await play(typed("hola ", { every: 50, hold: 30 }), { waitBeforeFinish: 2_000 });
    expect(outcome).toMatchObject({ kind: "ok", response: { verdict: "rejected", reason: "connection" } });
    expect(await storedReason(gameId)).toBe("late");
  });

  it("el final de una partida ajena o inexistente no se encuentra", async () => {
    expect(await service.finish({ owner: randomUUID(), gameId: randomUUID(), lastSeq: 0, ipHash: null })).toEqual({ kind: "not_found" });
  });

  it("empezar otra partida cierra la anterior", async () => {
    const owner = randomUUID();
    const first = await service.start({ owner, language: "en", env: ENV });
    await service.start({ owner, language: "en", env: ENV });
    expect(await service.finish({ owner, gameId: first.gameId, lastSeq: 0, ipHash: null })).toEqual({ kind: "closed" });
  });
});
