import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { periodKey, type Period } from "@/lib/leaderboard/periods";
import { createRedis } from "../redis";
import { boardKey, createLeaderboardStore, type Board } from "./store";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
// Prefijo propio: los rankings de este archivo empiezan vacíos en cada ejecución.
const prefix = `${process.env.REDIS_KEY_PREFIX}store-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
const NOW = new Date();

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
});

function board(period: Period): Board {
  return { language: "es", inputType: "physical", period, key: periodKey(period, NOW) };
}

describe("rankings en Redis", () => {
  it("ZADD GT no baja la puntuación", async () => {
    await store.add([{ board: board("day"), userId: "u1", score: 100, achievedAt: NOW }]);
    await store.add([{ board: board("day"), userId: "u1", score: 90, achievedAt: NOW }]);
    expect(Number(await redis.zscore(boardKey(prefix, board("day")), "u1"))).toBe(100);
  });

  it("la posición: 1 es el mejor; sin marca, null", async () => {
    await store.add([
      { board: board("week"), userId: "a", score: 300, achievedAt: NOW },
      { board: board("week"), userId: "b", score: 200, achievedAt: NOW },
      { board: board("week"), userId: "c", score: 100, achievedAt: NOW },
    ]);
    expect(await store.position(board("week"), "a")).toBe(1);
    expect(await store.position(board("week"), "c")).toBe(3);
    expect(await store.position(board("week"), "nadie")).toBeNull();
  });

  it("positionFor: la posición que tendría una puntuación, sin escribirla", async () => {
    await store.add([
      { board: board("month"), userId: "a", score: 300, achievedAt: NOW },
      { board: board("month"), userId: "b", score: 200, achievedAt: NOW },
    ]);
    expect(await store.positionFor(board("month"), 250)).toBe(2);
    expect(await store.positionFor(board("month"), 400)).toBe(1);
    expect(await store.positionFor(board("month"), 200)).toBe(2);
    expect(await redis.zcard(boardKey(prefix, board("month")))).toBe(2);
  });

  it("caducan el día a los 8 días de empezar y la semana a las 6 semanas; el resto no", async () => {
    await store.add(
      (["day", "week", "all"] as const).map((period) => ({ board: board(period), userId: "t", score: 1, achievedAt: NOW })),
    );
    const day = await redis.ttl(boardKey(prefix, board("day")));
    const week = await redis.ttl(boardKey(prefix, board("week")));
    expect(day).toBeGreaterThan(7 * 86_400 - 5);
    expect(day).toBeLessThanOrEqual(8 * 86_400);
    expect(week).toBeGreaterThan(35 * 86_400 - 5);
    expect(week).toBeLessThanOrEqual(42 * 86_400);
    expect(await redis.ttl(boardKey(prefix, board("all")))).toBe(-1);
  });

  it("remove quita al jugador de los rankings indicados", async () => {
    await store.add([
      { board: board("year"), userId: "r", score: 5, achievedAt: NOW },
      { board: board("all"), userId: "r", score: 5, achievedAt: NOW },
    ]);
    await store.remove("r", [board("year"), board("all")]);
    expect(await store.position(board("year"), "r")).toBeNull();
    expect(await store.position(board("all"), "r")).toBeNull();
  });
});
