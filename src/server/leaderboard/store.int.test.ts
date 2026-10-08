import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createRedis } from "../redis";
import { boardKey, createLeaderboardStore, type Board } from "./store";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
// Prefijo propio: los rankings de este archivo empiezan vacíos en cada ejecución.
const prefix = `${process.env.REDIS_KEY_PREFIX}store-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
});

/** Un ranking distinto en cada test: los 6 que hay, idioma × teclado. */
const ES_PHYSICAL: Board = { language: "es", inputType: "physical" };
const ES_TOUCH: Board = { language: "es", inputType: "touch" };
const EN_PHYSICAL: Board = { language: "en", inputType: "physical" };
const EN_TOUCH: Board = { language: "en", inputType: "touch" };
const PT_PHYSICAL: Board = { language: "pt", inputType: "physical" };
const PT_TOUCH: Board = { language: "pt", inputType: "touch" };

describe("rankings en Redis", () => {
  it("una clave por idioma y teclado, sin caducidad", async () => {
    await store.add([{ board: ES_PHYSICAL, userId: "k", score: 1 }]);
    expect(boardKey(prefix, ES_PHYSICAL)).toBe(`${prefix}lb:es:physical`);
    expect(await redis.ttl(boardKey(prefix, ES_PHYSICAL))).toBe(-1);
  });

  it("ZADD GT no baja la puntuación", async () => {
    await store.add([{ board: ES_TOUCH, userId: "u1", score: 100 }]);
    await store.add([{ board: ES_TOUCH, userId: "u1", score: 90 }]);
    expect(Number(await redis.zscore(boardKey(prefix, ES_TOUCH), "u1"))).toBe(100);
  });

  it("la posición: 1 es el mejor; sin marca, null", async () => {
    await store.add([
      { board: EN_PHYSICAL, userId: "a", score: 300 },
      { board: EN_PHYSICAL, userId: "b", score: 200 },
      { board: EN_PHYSICAL, userId: "c", score: 100 },
    ]);
    expect(await store.position(EN_PHYSICAL, "a")).toBe(1);
    expect(await store.position(EN_PHYSICAL, "c")).toBe(3);
    expect(await store.position(EN_PHYSICAL, "nadie")).toBeNull();
  });

  it("positionFor: la posición que tendría una puntuación, sin escribirla", async () => {
    await store.add([
      { board: EN_TOUCH, userId: "a", score: 300 },
      { board: EN_TOUCH, userId: "b", score: 200 },
    ]);
    expect(await store.positionFor(EN_TOUCH, 250)).toBe(2);
    expect(await store.positionFor(EN_TOUCH, 400)).toBe(1);
    expect(await store.positionFor(EN_TOUCH, 200)).toBe(2);
    expect(await redis.zcard(boardKey(prefix, EN_TOUCH))).toBe(2);
  });

  it("remove quita al jugador de los rankings indicados", async () => {
    await store.add([
      { board: PT_PHYSICAL, userId: "r", score: 5 },
      { board: PT_TOUCH, userId: "r", score: 5 },
    ]);
    await store.remove("r", [PT_PHYSICAL, PT_TOUCH]);
    expect(await store.position(PT_PHYSICAL, "r")).toBeNull();
    expect(await store.position(PT_TOUCH, "r")).toBeNull();
  });
});
