import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedPendingVerification } from "@/test/pending-verification";
import { createDb } from "../db/client";
import { recordVerifications, users } from "../db/schema";
import { pendingVerifications } from "./pending";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `pv_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  return row.id;
}

const byId = (id: string) => eq(recordVerifications.id, id);

describe("a player's pending verifications", () => {
  it("their own, unexpired and with attempts left, the one expiring soonest first", async () => {
    const userId = await newUser();
    const physical = await seedPendingVerification(db, userId, { wpm: 72.4 });
    const touch = await seedPendingVerification(db, userId, { inputType: "touch", wpm: 50 });
    const spanish = await seedPendingVerification(db, userId, { language: "es" });
    const expired = await seedPendingVerification(db, userId, { language: "pt" });
    await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() + interval '2 hours'`, attempts: 1 })
      .where(byId(touch.verification.id));
    await db.update(recordVerifications).set({ attempts: 3 }).where(byId(spanish.verification.id));
    await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(byId(expired.verification.id));
    await seedPendingVerification(db, await newUser());

    expect(await pendingVerifications(db, userId)).toEqual([
      { ...touch.verification, attemptsLeft: 2, expiresAt: expect.any(String) },
      {
        id: physical.verification.id,
        language: "en",
        inputType: "physical",
        targetWpm: 72.4,
        requiredWpm: 61.6,
        attemptsLeft: 3,
        expiresAt: physical.verification.expiresAt,
      },
    ]);
  });

  it("a verified or failed one is no longer pending", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    await db.update(recordVerifications).set({ status: "verified" }).where(byId(verification.id));
    expect(await pendingVerifications(db, userId)).toEqual([]);
  });
});
