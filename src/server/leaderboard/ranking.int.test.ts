import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Verdict } from "@/lib/game/types";
import { periodKey } from "@/lib/leaderboard/periods";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { createRedis } from "../redis";
import { createRanking, type BoardChange } from "./ranking";
import { boardKey, createLeaderboardStore, type Board } from "./store";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}ranking-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
const changes: BoardChange[][] = [];
const ranking = createRanking({ db, store, onTopChanged: (change) => changes.push(change) });
const saveGame = createSaveGame(db);
const NOW = new Date();
const TODAY: Board = { language: "es", inputType: "physical", period: "day", key: periodKey("day", NOW) };

beforeEach(() => {
  changes.length = 0;
});

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

async function newUser(status: "active" | "shadowbanned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `r_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

/** Guarda la partida (con sus marcas, si cuenta) y pide su ranking, como hace `finish`. */
async function play(userId: string | null, wpm: number, { accuracy = 98, verdict = "valid" as Verdict } = {}) {
  const saved = await saveGame({
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: "es",
    inputType: "physical",
    wpm,
    rawWpm: wpm,
    accuracy,
    verdict,
    rejectReason: verdict === "valid" ? null : "untrusted",
    ipHash: null,
    startsAt: NOW,
    finishedAt: NOW,
    batches: [],
  });
  return ranking.rankGame({
    userId,
    language: "es",
    inputType: "physical",
    verdict,
    wpm,
    accuracy,
    startsAt: NOW,
    improved: saved.improved,
  });
}

describe("ranking de una partida", () => {
  it("una partida no válida no tiene ranking", async () => {
    expect(await play(await newUser(), 50, { verdict: "rejected" })).toEqual({ kind: "unranked" });
  });

  it("por debajo del 90 % de precisión no entra", async () => {
    expect(await play(await newUser(), 50, { accuracy: 89.9 })).toEqual({ kind: "low_accuracy" });
  });

  it("con cuenta: entra en los rankings y devuelve su posición en cada periodo", async () => {
    const fast = await newUser();
    await play(fast, 150);
    const slow = await newUser();
    const result = await play(slow, 140);
    expect(result).toEqual({
      kind: "ranked",
      ranks: { day: 2, week: 2, month: 2, all: 2 },
      improved: ["day", "week", "month", "all"],
    });
    expect(await store.position(TODAY, fast)).toBe(1);
  });

  it("sin mejorar, enseña su posición de siempre", async () => {
    const player = await newUser();
    await play(player, 145);
    const result = await play(player, 60);
    expect(result).toMatchObject({ kind: "ranked", improved: [] });
    if (result.kind !== "ranked") throw new Error(result.kind);
    expect(result.ranks.day).toBe(await store.position(TODAY, player));
  });

  it("anónima: la posición que tendría, sin escribir en el ranking", async () => {
    const before = await redis.zcard(boardKey(prefix, TODAY));
    expect(await play(null, 500)).toEqual({ kind: "would_rank", ranks: { day: 1, week: 1, month: 1, all: 1 } });
    expect(await redis.zcard(boardKey(prefix, TODAY))).toBe(before);
  });

  it("shadow-ban: ve su posición «como si estuviera», pero no entra en el ranking", async () => {
    const hidden = await newUser("shadowbanned");
    expect(await play(hidden, 400)).toMatchObject({ kind: "ranked", ranks: { day: 1 } });
    expect(await store.position(TODAY, hidden)).toBeNull();
    expect(changes).toEqual([]);
  });

  it("entrar en el top 100 revalida la página de ese ranking", async () => {
    await play(await newUser(), 130);
    expect(changes).toEqual([
      [
        { language: "es", inputType: "physical", period: "day" },
        { language: "es", inputType: "physical", period: "week" },
        { language: "es", inputType: "physical", period: "month" },
        { language: "es", inputType: "physical", period: "all" },
      ],
    ]);
  });

  it("posición propia: la de su marca en ese ranking, o null si no tiene", async () => {
    const player = await newUser();
    await play(player, 120);
    expect(await ranking.myPosition(player, TODAY)).toEqual({
      rank: await store.position(TODAY, player),
      wpm: 120,
      accuracy: 98,
    });
    expect(await ranking.myPosition(await newUser(), TODAY)).toEqual({ rank: null });
  });

  it("si Redis perdió la marca del jugador, la recupera desde PostgreSQL y la posición es la de su marca", async () => {
    const player = await newUser();
    await play(player, 200);
    await store.remove(player, [TODAY]);
    const result = await play(player, 10);
    expect(result).toMatchObject({ kind: "ranked", improved: [] });
    if (result.kind !== "ranked") throw new Error(result.kind);
    const position = await store.position(TODAY, player);
    expect(position).not.toBeNull();
    expect(result.ranks.day).toBe(position);
  });
});
