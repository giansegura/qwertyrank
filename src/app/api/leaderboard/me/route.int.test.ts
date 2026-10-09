import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { createSaveGame } from "@/server/game/persist";

const getSessionUser = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));

import { GET } from "./route";

const db = createDb(process.env.DATABASE_URL!);
const saveGame = createSaveGame(db);
const request = (query: string) => new NextRequest(`http://localhost/api/leaderboard/me?${query}`);

afterAll(async () => {
  await db.$client.end();
});

beforeEach(() => {
  getSessionUser.mockReset();
});

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `lm_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  await verifyEverywhere(db, row.id);
  return row.id;
}

/** Saves a valid game: leaves its record in `bests`, without touching Redis (the position comes from the score). */
async function play(userId: string, wpm: number, accuracy: number) {
  const startsAt = new Date();
  await saveGame({
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: "pt",
    inputType: "touch",
    wpm,
    rawWpm: wpm,
    accuracy,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
  });
}

describe("GET /api/leaderboard/me", () => {
  it("with an invalid language or keyboard, 400 invalid_query", async () => {
    for (const query of ["lang=xx&input=touch", "lang=pt&input=gamepad", "lang=pt", ""]) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_query" });
    }
  });

  it("without a session, 401 unauthorized", async () => {
    getSessionUser.mockResolvedValue(null);
    const response = await GET(request("lang=pt&input=touch"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("with a session and a record in that ranking, their position and record, without cache", async () => {
    const userId = await newUser();
    await play(userId, 77, 96);
    getSessionUser.mockResolvedValue({ id: userId });

    const response = await GET(request("lang=pt&input=touch"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ rank: expect.any(Number), wpm: 77, accuracy: 96 });
  });

  it("with a session and no record in that ranking, rank null", async () => {
    getSessionUser.mockResolvedValue({ id: await newUser() });
    const response = await GET(request("lang=pt&input=touch"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ rank: null });
  });

  it("a leftover `period` parameter is ignored", async () => {
    getSessionUser.mockResolvedValue({ id: await newUser() });
    const response = await GET(request("lang=pt&input=touch&period=day"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rank: null });
  });
});
