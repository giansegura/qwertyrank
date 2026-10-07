import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import { users } from "../db/schema";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const getSessionUser = vi.fn();
vi.mock("../auth/session", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));

import { requireAdmin } from "./admin";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

beforeEach(() => getSessionUser.mockReset());

async function newUser(role: "user" | "admin") {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `q_${randomUUID().slice(0, 8)}`, role })
    .returning({ id: users.id });
  return row.id;
}

const NOT_FOUND = expect.objectContaining({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) });

describe("requireAdmin", () => {
  it("sin sesión, 404", async () => {
    getSessionUser.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toEqual(NOT_FOUND);
  });

  it("con sesión de un jugador que no es admin, 404", async () => {
    getSessionUser.mockResolvedValue({ id: await newUser("user") });
    await expect(requireAdmin()).rejects.toEqual(NOT_FOUND);
  });

  it("con sesión de un admin, devuelve su id", async () => {
    const id = await newUser("admin");
    getSessionUser.mockResolvedValue({ id });
    await expect(requireAdmin()).resolves.toEqual({ id });
  });
});
