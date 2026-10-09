import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedPendingVerification } from "@/test/pending-verification";
import { createDb } from "../db/client";
import { recordVerifications, users } from "../db/schema";
import { spendAttempt } from "./attempts";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `a_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  return row.id;
}

const attemptsOf = async (id: string) =>
  (await db.select({ attempts: recordVerifications.attempts }).from(recordVerifications).where(eq(recordVerifications.id, id)))[0]
    .attempts;

describe("verification attempts", () => {
  it("each start spends one and says which attempt it is and with which keyboard; after the third, none", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId, { inputType: "touch" });
    const spend = () => spendAttempt(db, { verificationId: verification.id, userId, language: "en" });
    expect(await spend()).toEqual({ id: verification.id, attempt: 1, inputType: "touch" });
    expect(await spend()).toMatchObject({ attempt: 2 });
    expect(await spend()).toMatchObject({ attempt: 3 });
    expect(await spend()).toBeNull();
    expect(await attemptsOf(verification.id)).toBe(3);
  });

  it("another player's does not work, nor one in another language, expired or closed", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    expect(await spendAttempt(db, { verificationId: verification.id, userId: await newUser(), language: "en" })).toBeNull();
    expect(await spendAttempt(db, { verificationId: verification.id, userId, language: "es" })).toBeNull();
    expect(await spendAttempt(db, { verificationId: randomUUID(), userId, language: "en" })).toBeNull();

    await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(recordVerifications.id, verification.id));
    expect(await spendAttempt(db, { verificationId: verification.id, userId, language: "en" })).toBeNull();

    await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() + interval '1 hour'`, status: "verified" })
      .where(eq(recordVerifications.id, verification.id));
    expect(await spendAttempt(db, { verificationId: verification.id, userId, language: "en" })).toBeNull();
    expect(await attemptsOf(verification.id)).toBe(0);
  });

  it("from several devices at once no more than 3 are ever spent", async () => {
    const userId = await newUser();
    const { verification } = await seedPendingVerification(db, userId);
    const spent = await Promise.all(
      Array.from({ length: 5 }, () => spendAttempt(db, { verificationId: verification.id, userId, language: "en" })),
    );
    expect(spent.filter(Boolean).map((attempt) => attempt!.attempt).sort()).toEqual([1, 2, 3]);
    expect(await attemptsOf(verification.id)).toBe(3);
  });
});
