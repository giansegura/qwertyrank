import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@/server/db/client";
import { games, keystrokeLogs, users } from "@/server/db/schema";
import { encodeKeystrokeLog } from "@/server/game/keystroke-log";

const db = createDb(process.env.DATABASE_URL!);
const DAY_MS = 86_400_000;

afterAll(async () => {
  await db.$client.end();
});

/** A game with an account from 40 days ago, with `ip_hash` and its keystroke log: what an unauthorized call must not touch. */
async function seedOldGame() {
  const [user] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `cr_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  const id = randomUUID();
  const when = new Date(Date.now() - 40 * DAY_MS);
  await db.insert(games).values({
    id,
    userId: user.id,
    anonId: randomUUID(),
    ipHash: "b".repeat(64),
    language: "pt",
    inputType: "physical",
    wpm: 60,
    rawWpm: 60,
    accuracy: 97.5,
    verdict: "valid",
    startsAt: when,
    finishedAt: when,
  });
  await db.insert(keystrokeLogs).values({
    gameId: id,
    events: encodeKeystrokeLog({
      words: ["a"],
      batches: [{ seq: 1, arrivedAt: 0, events: [{ t: 0, type: "input", deleted: 0, inserted: "a", trusted: true }] }],
    }),
    createdAt: when,
  });
  return id;
}

/** That the seeded game is unchanged: with its `ip_hash` and its keystroke log. */
async function expectUntouched(id: string) {
  const [game] = await db.select().from(games).where(eq(games.id, id));
  expect(game.ipHash).toBe("b".repeat(64));
  expect(await db.select().from(keystrokeLogs).where(eq(keystrokeLogs.gameId, id))).toHaveLength(1);
}

const SECRET = "c".repeat(32);

/** The route with `CRON_SECRET` freshly read: `serverEnv()` stores the variables the first time. */
async function cronRoute(secret: string | undefined) {
  vi.stubEnv("CRON_SECRET", secret);
  vi.resetModules();
  return import("./route");
}

const request = (authorization?: string) =>
  new NextRequest("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/daily", () => {
  it("without CRON_SECRET configured it responds 401 even if a header arrives", async () => {
    const id = await seedOldGame();
    const { GET } = await cronRoute(undefined);
    const response = await GET(request("Bearer undefined"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    await expectUntouched(id);
  });

  it("with another secret or without a header it responds 401", async () => {
    const id = await seedOldGame();
    const { GET } = await cronRoute(SECRET);
    expect((await GET(request(`Bearer ${"x".repeat(32)}`))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    await expectUntouched(id);
  });

  it("with the secret it runs the job and returns what it did, without cache", async () => {
    const { GET } = await cronRoute(SECRET);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      extracted: expect.any(Number),
      deletedLogs: expect.any(Number),
      anonymizedGames: expect.any(Number),
      done: true,
    });
  });
});
