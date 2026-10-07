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

describe("POST /api/game/start en modo verificación", () => {
  it("sin sesión, 401 unauthorized", async () => {
    getSessionUser.mockResolvedValue(null);
    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: randomUUID() });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("sin una verificación pendiente suya, 409 no_pending_verification", async () => {
    getSessionUser.mockResolvedValue({ id: await newUser() });
    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: randomUUID() });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no_pending_verification" });
  });

  it("gasta un intento y crea la partida de verificación en Redis", async () => {
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

  it("baneado durante la verificación: la puerta lo frena y no gasta el intento", async () => {
    // La verificación se abrió antes del ban.
    const userId = await newUser("banned");
    const { verification } = await seedPendingVerification(db, userId);
    getSessionUser.mockResolvedValue({ id: userId });
    const response = await start({ language: "en", env: ENV, mode: "verification", verificationId: verification.id });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "banned" });
    const [row] = await db.select().from(recordVerifications).where(eq(recordVerifications.id, verification.id));
    expect(row.attempts).toBe(0);
  });

  it("varios inicios a la vez: tres partidas y el resto 409", async () => {
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
