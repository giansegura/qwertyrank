import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRedis } from "../redis";
import { MAX_BYTES_PER_GAME, MAX_EVENTS_PER_GAME, createGameStore, type NewGame } from "./store";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const store = createGameStore(redis, process.env.REDIS_KEY_PREFIX!);
const TIMES = { countdownMs: 3_000, durationMs: 30_000, graceMs: 3_000 };

function newGame(owner = randomUUID()): NewGame {
  return {
    id: randomUUID(),
    owner,
    userId: null,
    language: "es",
    words: ["hola", "mundo"],
    env: { coarse: false, touchPoints: 0 },
    times: TIMES,
  };
}

describe("GameStore (Redis)", () => {
  it("crea la partida con la hora oficial de Redis", async () => {
    const before = Date.now();
    const game = await store.create(newGame());
    expect(game.issuedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(game.startsAt).toBe(game.issuedAt + 3_000);
    expect(game.deadline).toBe(game.startsAt + 33_000);
    expect(game.words).toEqual(["hola", "mundo"]);
  });

  it("acepta tandas en orden, ignora duplicados y rechaza huecos", async () => {
    const input = newGame();
    await store.create(input);
    expect(await store.append(input.id, input.owner, 1, "[]", 1)).toBe("ok");
    expect(await store.append(input.id, input.owner, 1, "[]", 1)).toBe("duplicate");
    expect(await store.append(input.id, input.owner, 3, "[]", 1)).toBe("out_of_order");
    expect(await store.append(input.id, input.owner, 2, '[{"t":1}]', 1)).toBe("ok");
  });

  it("no deja escribir en la partida de otro", async () => {
    const input = newGame();
    await store.create(input);
    expect(await store.append(input.id, randomUUID(), 1, "[]", 1)).toBe("not_found");
    expect(await store.claimFinish(input.id, randomUUID())).toEqual({ kind: "not_found" });
  });

  it("al reclamar el final devuelve la partida y las tandas con su hora de llegada", async () => {
    const input = newGame();
    const game = await store.create(input);
    await store.append(input.id, input.owner, 1, '[{"t":5,"type":"input"}]', 1);
    const claim = await store.claimFinish(input.id, input.owner);
    if (claim.kind !== "ready") throw new Error(claim.kind);
    expect(claim.game).toMatchObject({ id: input.id, owner: input.owner, startsAt: game.startsAt, lastSeq: 1 });
    expect(claim.batches).toHaveLength(1);
    expect(claim.batches[0].seq).toBe(1);
    expect(claim.batches[0].payload).toBe('[{"t":5,"type":"input"}]');
    expect(claim.batches[0].arrivedAt).toBeGreaterThanOrEqual(game.issuedAt);
    expect(claim.finishedAt).toBeGreaterThanOrEqual(claim.batches[0].arrivedAt);
  });

  it("el final es idempotente: mientras se procesa da 'busy' y después devuelve el mismo resultado", async () => {
    const input = newGame();
    await store.create(input);
    expect((await store.claimFinish(input.id, input.owner)).kind).toBe("ready");
    expect(await store.claimFinish(input.id, input.owner)).toEqual({ kind: "busy" });
    expect(await store.append(input.id, input.owner, 1, "[]", 1)).toBe("closed");
    await store.complete(input.id, '{"wpm":42}');
    expect(await store.claimFinish(input.id, input.owner)).toEqual({ kind: "done", result: '{"wpm":42}' });
  });

  it("si falla el guardado, release permite reintentar el final", async () => {
    const input = newGame();
    await store.create(input);
    await store.claimFinish(input.id, input.owner);
    await store.release(input.id);
    expect((await store.claimFinish(input.id, input.owner)).kind).toBe("ready");
  });

  it("rechaza tandas que superan el límite de eventos o de tamaño de una partida", async () => {
    const input = newGame();
    await store.create(input);
    expect(await store.append(input.id, input.owner, 1, "[]", MAX_EVENTS_PER_GAME + 1)).toBe("too_large");
    expect(await store.append(input.id, input.owner, 1, "x".repeat(MAX_BYTES_PER_GAME + 1), 1)).toBe("too_large");
    expect(await store.append(input.id, input.owner, 1, "[]", MAX_EVENTS_PER_GAME)).toBe("ok");
    expect(await store.append(input.id, input.owner, 2, "[]", 1)).toBe("too_large");
  });

  it("una partida nueva del mismo jugador abandona la anterior", async () => {
    const owner = randomUUID();
    const first = newGame(owner);
    const second = newGame(owner);
    await store.create(first);
    await store.create(second);
    expect(await store.append(first.id, owner, 1, "[]", 1)).toBe("closed");
    expect(await store.claimFinish(first.id, owner)).toEqual({ kind: "closed" });
    expect(await store.append(second.id, owner, 1, "[]", 1)).toBe("ok");
  });

  it("guarda el usuario de la partida", async () => {
    const input = { ...newGame(), userId: randomUUID() };
    await store.create(input);
    expect(await store.claimFinish(input.id, input.owner)).toMatchObject({
      kind: "ready",
      game: { userId: input.userId },
    });
  });

  it("una partida sin sesión no tiene usuario", async () => {
    const input = newGame();
    await store.create(input);
    expect(await store.claimFinish(input.id, input.owner)).toMatchObject({ kind: "ready", game: { userId: null } });
  });

  it("un usuario solo tiene una partida activa, aunque juegue en dos navegadores", async () => {
    const userId = randomUUID();
    const first = { ...newGame(), userId };
    const second = { ...newGame(), userId };
    await store.create(first);
    await store.create(second);
    expect(await store.append(first.id, first.owner, 1, "[]", 1)).toBe("closed");
    expect(await store.append(second.id, second.owner, 1, "[]", 1)).toBe("ok");
  });

  it("una partida de verificación recuerda su verificación y su intento; una Ranked, ninguna", async () => {
    const verification = { id: randomUUID(), attempt: 2 };
    const input = { ...newGame(), userId: randomUUID(), verification };
    expect((await store.create(input)).verification).toEqual(verification);
    expect(await store.claimFinish(input.id, input.owner)).toMatchObject({ kind: "ready", game: { verification } });

    const ranked = newGame();
    await store.create(ranked);
    expect(await store.claimFinish(ranked.id, ranked.owner)).toMatchObject({ kind: "ready", game: { verification: null } });
  });
});
