import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Verdict } from "@/lib/game/types";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { createRedis } from "../redis";
import { createRanking, type Ranking } from "./ranking";
import { boardKey, createLeaderboardStore, type Board, type LeaderboardStore } from "./store";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}ranking-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
const changes: Board[][] = [];
const ranking = createRanking({ db, store, onTopChanged: (change) => changes.push(change) });
const saveGame = createSaveGame(db);
const NOW = new Date();
const BOARD: Board = { language: "es", inputType: "physical" };

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
  await verifyEverywhere(db, row.id);
  return row.id;
}

/** Guarda la partida (con sus marcas, si cuenta) y pide su ranking, como hace `finish`. */
async function play(
  userId: string | null,
  wpm: number,
  { accuracy = 98, verdict = "valid" as Verdict, startsAt = NOW, using = ranking as Ranking } = {},
) {
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
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
  });
  return using.rankGame({
    userId,
    language: "es",
    inputType: "physical",
    verdict,
    wpm,
    accuracy,
    startsAt,
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

  it("con cuenta: entra en el ranking y devuelve su posición", async () => {
    const fast = await newUser();
    await play(fast, 150);
    const slow = await newUser();
    expect(await play(slow, 140)).toEqual({ kind: "ranked", rank: 2, improved: true });
    expect(await store.position(BOARD, fast)).toBe(1);
  });

  it("sin mejorar, enseña la posición de su marca", async () => {
    const player = await newUser();
    await play(player, 145);
    const result = await play(player, 60);
    expect(result).toMatchObject({ kind: "ranked", improved: false });
    if (result.kind !== "ranked") throw new Error(result.kind);
    expect(result.rank).toBe(await store.position(BOARD, player));
  });

  it("una marca de otro día sigue contando: no hay periodos", async () => {
    const player = await newUser();
    await play(player, 170, { startsAt: new Date(NOW.getTime() - 40 * 86_400_000) });
    const result = await play(player, 60);
    expect(result).toMatchObject({ kind: "ranked", improved: false });
    if (result.kind !== "ranked") throw new Error(result.kind);
    expect(result.rank).toBe(await store.position(BOARD, player));
  });

  it("anónima: la posición que tendría, sin escribir en el ranking", async () => {
    const before = await redis.zcard(boardKey(prefix, BOARD));
    expect(await play(null, 500)).toEqual({ kind: "would_rank", rank: 1 });
    expect(await redis.zcard(boardKey(prefix, BOARD))).toBe(before);
  });

  it("shadow-ban: ve su posición «como si estuviera», pero no entra en el ranking", async () => {
    const hidden = await newUser("shadowbanned");
    expect(await play(hidden, 400)).toEqual({ kind: "ranked", rank: 1, improved: true });
    expect(await store.position(BOARD, hidden)).toBeNull();
    expect(changes).toEqual([]);
  });

  it("entrar en el top 100 revalida la página de ese ranking", async () => {
    await play(await newUser(), 130);
    expect(changes).toEqual([[BOARD]]);
  });

  it("sin mejorar su marca no revalida nada", async () => {
    const player = await newUser();
    await play(player, 125);
    changes.length = 0;
    await play(player, 20);
    expect(changes).toEqual([]);
  });

  it("posición propia: la de su marca en ese ranking, o null si no tiene", async () => {
    const player = await newUser();
    await play(player, 120);
    expect(await ranking.myPosition(player, BOARD)).toEqual({
      rank: await store.position(BOARD, player),
      wpm: 120,
      accuracy: 98,
    });
    expect(await ranking.myPosition(await newUser(), BOARD)).toEqual({ rank: null });
  });

  it("si Redis perdió la marca del jugador, la recupera desde PostgreSQL y la posición es la de su marca", async () => {
    const player = await newUser();
    await play(player, 200);
    await store.remove(player, [BOARD]);
    const result = await play(player, 10);
    expect(result).toMatchObject({ kind: "ranked", improved: false });
    if (result.kind !== "ranked") throw new Error(result.kind);
    const position = await store.position(BOARD, player);
    expect(position).not.toBeNull();
    expect(result.rank).toBe(position);
  });

  it("si falla la revalidación de la página, la partida conserva su ranking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createRanking({
      db,
      store,
      onTopChanged: () => {
        throw new Error("revalidate failed");
      },
    });
    expect(await play(await newUser(), 135, { using: failing })).toMatchObject({ kind: "ranked", rank: expect.any(Number) });
    vi.mocked(console.error).mockRestore();
  });

  it("con Redis caído responde sin posiciones, y la anónima se puede guardar igual", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = () => Promise.reject(new Error("redis down"));
    const broken = createRanking({
      db,
      store: { add: down, position: down, positionFor: down, remove: down } satisfies LeaderboardStore,
      onTopChanged: () => {},
    });
    expect(await play(null, 100, { using: broken })).toEqual({ kind: "unavailable", canSave: true });
    expect(await play(await newUser(), 100, { using: broken })).toEqual({ kind: "unavailable", canSave: false });
    vi.mocked(console.error).mockRestore();
  });

  it("si le sancionan mientras se escribe su partida, no se queda en Redis", async () => {
    const player = await newUser();
    // La sanción llega justo después de escribir en Redis y antes de la comprobación final.
    const sanctionedMidway: LeaderboardStore = {
      ...store,
      async add(entries) {
        await store.add(entries);
        await db.update(users).set({ status: "shadowbanned" }).where(eq(users.id, player));
      },
    };
    const racing = createRanking({ db, store: sanctionedMidway, onTopChanged: () => {} });
    await play(player, 160, { using: racing });
    expect(await store.position(BOARD, player)).toBeNull();
  });
});
