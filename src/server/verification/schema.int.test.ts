import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { games, recordVerifications, users, verifiedLevels } from "../db/schema";

const db = createDb(process.env.DATABASE_URL!);
const IN_A_DAY = () => new Date(Date.now() + 86_400_000);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `v_${randomUUID().slice(0, 8)}` })
    .returning({ id: users.id });
  return row.id;
}

async function newGame(userId: string, mode?: "ranked" | "verification"): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(games).values({
    id,
    userId,
    language: "en",
    inputType: "physical",
    wpm: 80,
    rawWpm: 80,
    accuracy: 97,
    verdict: "review",
    startsAt: now,
    finishedAt: now,
    ...(mode ? { mode } : {}),
  });
  return id;
}

const pending = (userId: string, gameId: string, inputType: "physical" | "touch" = "physical") => ({
  userId,
  gameId,
  language: "en" as const,
  inputType,
  expiresAt: IN_A_DAY(),
});

describe("record verification tables", () => {
  it("a single pending one per player, language and keyboard; once closed, another can be opened", async () => {
    const user = await newUser();
    const game = await newGame(user);
    const [first] = await db.insert(recordVerifications).values(pending(user, game)).returning();
    expect(first).toMatchObject({ status: "pending", attempts: 0, resolvedAt: null });
    await expect(db.insert(recordVerifications).values(pending(user, game))).rejects.toMatchObject({
      cause: { constraint_name: "record_verifications_pending_idx" },
    });
    await db.insert(recordVerifications).values(pending(user, game, "touch"));
    await db.update(recordVerifications).set({ status: "failed" }).where(eq(recordVerifications.id, first.id));
    await db.insert(recordVerifications).values(pending(user, game));
  });

  it("never more than 3 attempts", async () => {
    const user = await newUser();
    const [row] = await db.insert(recordVerifications).values(pending(user, await newGame(user))).returning();
    await db.update(recordVerifications).set({ attempts: 3 }).where(eq(recordVerifications.id, row.id));
    await expect(
      db.update(recordVerifications).set({ attempts: 4 }).where(eq(recordVerifications.id, row.id)),
    ).rejects.toMatchObject({ cause: { constraint_name: "record_verifications_attempts_check" } });
  });

  it("deleting the player removes their verifications and levels; their games are left without a verification", async () => {
    const user = await newUser();
    const game = await newGame(user);
    const [row] = await db.insert(recordVerifications).values(pending(user, game)).returning();
    await db.update(games).set({ verificationId: row.id }).where(eq(games.id, game));
    await db.insert(verifiedLevels).values({ userId: user, language: "en", inputType: "physical", wpm: 90 });

    await db.delete(users).where(eq(users.id, user));

    expect(await db.select().from(recordVerifications).where(eq(recordVerifications.id, row.id))).toEqual([]);
    expect(await db.select().from(verifiedLevels).where(eq(verifiedLevels.userId, user))).toEqual([]);
    const [after] = await db.select().from(games).where(eq(games.id, game));
    expect(after).toMatchObject({ userId: null, verificationId: null, wpm: 80 });
  });

  it("deleting the game removes its verification", async () => {
    const user = await newUser();
    const game = await newGame(user);
    const [row] = await db.insert(recordVerifications).values(pending(user, game)).returning();
    await db.delete(games).where(eq(games.id, game));
    expect(await db.select().from(recordVerifications).where(eq(recordVerifications.id, row.id))).toEqual([]);
  });

  it("a game is Ranked unless stated otherwise, and there are only two modes", async () => {
    const user = await newUser();
    const [ranked] = await db.select({ mode: games.mode }).from(games).where(eq(games.id, await newGame(user)));
    expect(ranked.mode).toBe("ranked");
    const [verification] = await db
      .select({ mode: games.mode })
      .from(games)
      .where(eq(games.id, await newGame(user, "verification")));
    expect(verification.mode).toBe("verification");
    await expect(newGame(user, "practice" as "ranked")).rejects.toMatchObject({ cause: { constraint_name: "games_mode_check" } });
  });
});
