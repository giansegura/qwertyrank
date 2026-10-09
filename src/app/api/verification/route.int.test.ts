import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedPendingVerification } from "@/test/pending-verification";
import { createDb } from "@/server/db/client";
import { users } from "@/server/db/schema";

const getSessionUser = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));

import { GET } from "./route";

const db = createDb(process.env.DATABASE_URL!);
const request = () => new NextRequest("http://localhost/api/verification");

afterAll(async () => {
  await db.$client.end();
});

beforeEach(() => {
  getSessionUser.mockReset();
});

describe("GET /api/verification", () => {
  it("without a session, 401 unauthorized", async () => {
    getSessionUser.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("with a session, their pending ones and without cache", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "", email: `${randomUUID()}@example.com`, nick: `gv_${randomUUID().slice(0, 8)}` })
      .returning({ id: users.id });
    const { verification } = await seedPendingVerification(db, user.id);
    getSessionUser.mockResolvedValue({ id: user.id });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ pending: [verification] });
  });

  it("if the session or the database fails, 503 unavailable", async () => {
    getSessionUser.mockImplementation(async () => {
      throw new Error("db down");
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});
