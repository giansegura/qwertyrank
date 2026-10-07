import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import { seedPendingVerification } from "@/test/pending-verification";
import { createDb } from "../db/client";
import { recordVerifications, users } from "../db/schema";
import { recordQueues } from "./records";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(): Promise<{ id: string; nick: string }> {
  const nick = `rq_${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick })
    .returning({ id: users.id });
  return { id: row.id, nick };
}

/** Una verificación de un jugador nuevo, en el estado y con las fechas que se digan. */
async function record(change: (id: string) => Promise<unknown> = async () => {}) {
  const user = await newUser();
  const { gameId, verification } = await seedPendingVerification(db, user.id, { wpm: 91.5 });
  await change(verification.id);
  return { ...user, gameId, verificationId: verification.id };
}

const set = (values: PgUpdateSetSource<typeof recordVerifications>) => (id: string) =>
  db.update(recordVerifications).set(values).where(eq(recordVerifications.id, id));

describe("cola de récords del panel", () => {
  it("pendientes, verificados y fallidos o caducados; los cerrados, solo de los últimos 7 días", async () => {
    const older = await record(set({ createdAt: sql`now() - interval '1 hour'` }));
    const pending = await record();
    const verified = await record(set({ status: "verified", resolvedAt: sql`now()` }));
    const failed = await record(set({ status: "failed", resolvedAt: sql`now() - interval '1 day'`, attempts: 3 }));
    const expired = await record(set({ expiresAt: sql`now() - interval '1 hour'` }));
    const oldVerified = await record(set({ status: "verified", resolvedAt: sql`now() - interval '8 days'` }));
    const oldFailed = await record(set({ status: "failed", resolvedAt: sql`now() - interval '8 days'` }));
    const oldExpired = await record(set({ expiresAt: sql`now() - interval '8 days'` }));
    const mine = new Set([older, pending, verified, failed, expired, oldVerified, oldFailed, oldExpired].map((row) => row.id));

    const queues = await recordQueues(db, 10_000);
    const ids = (list: { id: string; userId: string }[]) => list.filter((row) => mine.has(row.userId)).map((row) => row.id);

    expect(ids(queues.pending)).toEqual([pending.verificationId, older.verificationId]);
    expect(ids(queues.verified)).toEqual([verified.verificationId]);
    expect(ids(queues.closed)).toEqual([expired.verificationId, failed.verificationId]);
    expect(queues.pending.find((row) => row.id === pending.verificationId)).toMatchObject({
      nick: pending.nick,
      language: "en",
      inputType: "physical",
      gameId: pending.gameId,
      wpm: 91.5,
      attempts: 0,
      resolvedAt: null,
      state: "pending",
    });
    expect(queues.closed.find((row) => row.id === expired.verificationId)?.state).toBe("expired");
    expect(queues.closed.find((row) => row.id === failed.verificationId)).toMatchObject({ state: "failed", attempts: 3 });
  });

  it("como mucho `limit` filas en cada lista", async () => {
    await record();
    await record();
    const queues = await recordQueues(db, 1);
    expect(queues.pending).toHaveLength(1);
  });
});

