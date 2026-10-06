import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { moderationActions, users } from "../db/schema";
import { setAdminRole } from "./roles";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

describe("rol de admin", () => {
  it("lo da y lo quita por email, sin distinguir mayúsculas, y lo registra sin admin", async () => {
    const email = `${randomUUID()}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ name: "", email, nick: `adm_${randomUUID().slice(0, 8)}` })
      .returning({ id: users.id });

    expect(await setAdminRole(db, email.toUpperCase(), "admin")).toBe(true);
    expect((await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)))[0].role).toBe("admin");
    expect(await setAdminRole(db, email, "user")).toBe(true);
    expect((await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)))[0].role).toBe("user");

    const actions = await db
      .select({ adminId: moderationActions.adminId, action: moderationActions.action })
      .from(moderationActions)
      .where(eq(moderationActions.targetUserId, user.id))
      .orderBy(moderationActions.createdAt);
    expect(actions).toEqual([
      { adminId: null, action: "grant_admin" },
      { adminId: null, action: "revoke_admin" },
    ]);
  });

  it("con un email que no existe no hace nada", async () => {
    expect(await setAdminRole(db, `${randomUUID()}@example.com`, "admin")).toBe(false);
  });
});
