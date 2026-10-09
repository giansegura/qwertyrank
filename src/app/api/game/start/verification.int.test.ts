import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedPendingVerification } from "@/test/pending-verification";
import { createDb } from "@/server/db/client";
import { recordVerifications, users } from "@/server/db/schema";
import { createGameStore } from "@/server/game/store";
import { createRedis } from "@/server/redis";

const getSessionUser = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));

import { POST } from "./route";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const games = createGameStore(redis, process.env.REDIS_KEY_PREFIX!);
const ENV = { coarse: false, touchPoints: 0 };

afterAll(async () => {
  await db.$client.end();
});

beforeEach(() => {
  getSessionUser.mockReset();
});

const start = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/game/start", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

async function newUser(status: "active" | "banned" = "active"): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `sv_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id });
  return row.id;
}

describe("POST /api/game/start in verification mode", () => {
  it("without a session, 401 unauthorized", async () => {
    getSessionUser.mockResolvedValue(null);
    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: randomUUID() });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("without a pending verification of their own, 409 no_pending_verification", async () => {
    getSessionUser.mockResolvedValue({ id: await newUser() });
    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: randomUUID() });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_pending_verification" });
  });

  it("spends an attempt and creates the verification game in Redis", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    getSessionUser.mockResolvedValue({ id: userId });

    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: verification.id });
    expect(response.status).toBe(200);
    const { gameId, words } = await response.json();
    expect(words).toHaveLength(160);

    const owner = response.cookies.get("qr_anon")!.value.split(".")[0];
    expect(await games.claimFinish(gameId, owner)).toMatchObject({
      kind: "ready",
      game: { userId, verification: { id: verification.id, attempt: 1 } },
    });
  });

  it("banned during the verification: the gate stops them and the attempt is not spent", async () => {
    // The verification was opened before the ban.
    const userId = await newUser("banned");
    const { verification } = await seedPendingVerification(db, userId);
    getSessionUser.mockResolvedValue({ id: userId });
    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: verification.id });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "banned" });
    const [row] = await db.select().from(recordVerifications).where(eq(recordVerifications.id, verification.id));
    expect(row.attempts).toBe(0);
  });

  it("several starts at once: three games and the rest 409", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    getSessionUser.mockResolvedValue({ id: userId });
    const body = { language: "en", env: ENV, mode: "verification", verificationId: verification.id };
    const statuses = (await Promise.all(Array.from({ length: 4 }, () => start(body)))).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 200, 200, 409]);
    const [row] = await db.select().from(recordVerifications).where(eq(recordVerifications.id, verification.id));
    expect(row.attempts).toBe(3);
  });
});
