import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { recordVerifications, users } from "../db/schema";
import { openPendingVerification } from "../verification/pending";
import { insertGame, type GameRecord } from "./persist";
import { getOwnResult, getPublicResult, isPendingResult } from "./result";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(status: "active" | "shadowbanned" | "banned" = "active") {
  const nick = `Res_${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick, country: "ES", status })
    .returning({ id: users.id });
  return { id: row.id, nick };
}

async function newGame(userId: string | null, overrides: Partial<GameRecord> = {}, mode?: "verification") {
  const startsAt = new Date("2026-10-02T10:00:00.000Z");
  const record: GameRecord = {
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: "es",
    inputType: "physical",
    wpm: 81.6,
    rawWpm: 83,
    accuracy: 97.4,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
    ...overrides,
  };
  await insertGame(db, record, mode ? { mode } : {});
  return record.id;
}

describe("getPublicResult", () => {
  it("a valid anonymous game, with no player", async () => {
    const id = await newGame(null);
    expect(await getPublicResult(db, id)).toEqual({
      id,
      language: "es",
      inputType: "physical",
      wpm: 81.6,
      accuracy: 97.4,
      startsAt: new Date("2026-10-02T10:00:00.000Z"),
      player: null,
    });
  });

  it("a valid game from an active player, with their nick and country", async () => {
    const user = await newUser();
    const id = await newGame(user.id);
    expect((await getPublicResult(db, id))?.player).toEqual({ nick: user.nick, country: "ES" });
  });

  it("does not exist in review, rejected, verification, missing or with a non-UUID id", async () => {
    const user = await newUser();
    const ids = [
      await newGame(user.id, { verdict: "review" }),
      await newGame(user.id, { verdict: "rejected", rejectReason: "untrusted" }),
      await newGame(user.id, {}, "verification"),
      randomUUID(),
      "hola",
    ];
    for (const id of ids) expect(await getPublicResult(db, id)).toBeNull();
  });

  it("does not exist for others if the player is shadow banned or banned", async () => {
    for (const status of ["shadowbanned", "banned"] as const) {
      const user = await newUser(status);
      expect(await getPublicResult(db, await newGame(user.id))).toBeNull();
    }
  });
});

describe("getOwnResult", () => {
  it("the player sees their own even when shadow banned", async () => {
    const user = await newUser("shadowbanned");
    const id = await newGame(user.id);
    expect((await getOwnResult(db, user.id, id))?.player).toEqual({ nick: user.nick, country: "ES" });
  });

  it("not another player's, nor a rejected one, nor a non-UUID id", async () => {
    const owner = await newUser();
    const other = await newUser();
    expect(await getOwnResult(db, other.id, await newGame(owner.id))).toBeNull();
    expect(await getOwnResult(db, owner.id, await newGame(owner.id, { verdict: "rejected", rejectReason: "late" }))).toBeNull();
    expect(await getOwnResult(db, owner.id, "hola")).toBeNull();
  });
});

describe("isPendingResult", () => {
  /** A `review` game with its open verification, like `createSaveGame` leaves it. */
  async function reviewGame(status: "active" | "shadowbanned" = "active") {
    const user = await newUser(status);
    const id = await newGame(user.id, { verdict: "review" });
    const verification = await openPendingVerification(db, {
      userId: user.id,
      language: "es",
      inputType: "physical",
      gameId: id,
      wpm: 81.6,
    });
    return { id, verificationId: verification.id };
  }

  it("a review game whose verification is still open", async () => {
    const { id } = await reviewGame();
    expect(await isPendingResult(db, id)).toBe(true);
  });

  it("not once the verification failed or expired", async () => {
    const failed = await reviewGame();
    await db.update(recordVerifications).set({ status: "failed" }).where(eq(recordVerifications.id, failed.verificationId));
    const expired = await reviewGame();
    await db
      .update(recordVerifications)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(recordVerifications.id, expired.verificationId));
    expect(await isPendingResult(db, failed.id)).toBe(false);
    expect(await isPendingResult(db, expired.id)).toBe(false);
  });

  it("not for a sanctioned player, a valid game, a missing game or a non-UUID id", async () => {
    const { id } = await reviewGame("shadowbanned");
    expect(await isPendingResult(db, id)).toBe(false);
    expect(await isPendingResult(db, await newGame((await newUser()).id))).toBe(false);
    expect(await isPendingResult(db, randomUUID())).toBe(false);
    expect(await isPendingResult(db, "hola")).toBe(false);
  });
});
