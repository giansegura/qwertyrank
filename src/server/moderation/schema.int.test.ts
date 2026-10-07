import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { bannedIdentities, moderationActions, reports, users } from "../db/schema";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `m_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  return row.id;
}

describe("tablas de moderación", () => {
  it("una sola denuncia abierta por denunciante, denunciado y motivo; cerrada, se puede repetir", async () => {
    const [reporter, target] = [await newUser(), await newUser()];
    const report = { reporterId: reporter, targetUserId: target, reason: "cheating" as const };
    await db.insert(reports).values(report);
    await expect(db.insert(reports).values(report)).rejects.toThrow();
    await db.insert(reports).values({ ...report, reason: "offensive_nick" });
    await db.update(reports).set({ status: "dismissed" }).where(eq(reports.targetUserId, target));
    await db.insert(reports).values(report);
    expect(await db.select().from(reports).where(eq(reports.targetUserId, target))).toHaveLength(3);
  });

  it("al borrar al denunciado caen sus denuncias y acciones; al borrar al denunciante o al admin quedan sin él", async () => {
    const [reporter, target, admin, other] = [await newUser(), await newUser(), await newUser(), await newUser()];
    await db.insert(reports).values({ reporterId: reporter, targetUserId: target, reason: "cheating" });
    await db.insert(moderationActions).values({ adminId: admin, targetUserId: target, action: "shadowban", reason: "bot" });
    await db.insert(reports).values({ reporterId: reporter, targetUserId: other, reason: "cheating", resolvedBy: admin });
    await db
      .insert(moderationActions)
      .values({ adminId: admin, targetUserId: other, action: "reset_nick", reason: "ofensivo", details: { from: "a", to: "b" } });

    await db.delete(users).where(eq(users.id, target));
    expect(await db.select().from(reports).where(eq(reports.targetUserId, target))).toEqual([]);
    expect(await db.select().from(moderationActions).where(eq(moderationActions.targetUserId, target))).toEqual([]);

    await db.delete(users).where(eq(users.id, reporter));
    await db.delete(users).where(eq(users.id, admin));
    const [report] = await db.select().from(reports).where(eq(reports.targetUserId, other));
    expect(report).toMatchObject({ reporterId: null, resolvedBy: null, status: "open" });
    const [action] = await db.select().from(moderationActions).where(eq(moderationActions.targetUserId, other));
    expect(action).toMatchObject({ adminId: null, details: { from: "a", to: "b" } });
  });

  it("una identidad baneada sobrevive al borrado de su usuario", async () => {
    const user = await newUser();
    const hash = randomUUID();
    await db.insert(bannedIdentities).values({ hash, kind: "email", userId: user });
    await db.delete(users).where(eq(users.id, user));
    const [row] = await db.select().from(bannedIdentities).where(eq(bannedIdentities.hash, hash));
    expect(row).toMatchObject({ kind: "email", userId: null });
  });
});
