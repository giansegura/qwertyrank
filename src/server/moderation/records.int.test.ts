import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import { seedPendingVerification } from "@/test/pending-verification";
import { createDb } from "../db/client";
import { games, keystrokeLogs, recordVerifications, users } from "../db/schema";
import { insertGame } from "../game/persist";
import { gameDetail, recordQueues } from "./records";

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

/** A verification of a new player, in the given state and with the given dates. */
async function record(change: (id: string) => Promise<unknown> = async () => {}) {
  const user = await newUser();
  const { gameId, verification } = await seedPendingVerification(db, user.id, { wpm: 91.5 });
  await change(verification.id);
  return { ...user, gameId, verificationId: verification.id };
}

const set = (values: PgUpdateSetSource<typeof recordVerifications>) => (id: string) =>
  db.update(recordVerifications).set(values).where(eq(recordVerifications.id, id));

describe("panel record queue", () => {
  it("pending, verified and failed or expired; closed ones only from the last 7 days", async () => {
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

  it("at most `limit` rows in each list", async () => {
    await record();
    await record();
    const queues = await recordQueues(db, 1);
    expect(queues.pending).toHaveLength(1);
  });
});


describe("game for the panel", () => {
  const EVENT = { t: 0, type: "input", deleted: 0, inserted: "h", trusted: true } as const;

  async function bareGame(userId: string | null) {
    const id = randomUUID();
    const now = new Date();
    await db.insert(games).values({
      id,
      userId,
      language: "es",
      inputType: "touch",
      wpm: 40,
      rawWpm: 42,
      accuracy: 91,
      verdict: "rejected",
      rejectReason: "fabricated_timing",
      startsAt: now,
      finishedAt: now,
    });
    return id;
  }

  it("with the new log it brings the words and the events, and the player", async () => {
    const user = await newUser();
    const id = randomUUID();
    const now = new Date();
    await insertGame(
      db,
      {
        id,
        userId: user.id,
        anonId: randomUUID(),
        language: "en",
        inputType: "physical",
        wpm: 80,
        rawWpm: 81,
        accuracy: 97,
        verdict: "valid",
        rejectReason: null,
        ipHash: null,
        startsAt: now,
        finishedAt: now,
        words: ["hola"],
        batches: [{ seq: 1, arrivedAt: 1, events: [EVENT] }],
      },
      { mode: "verification" },
    );
    expect(await gameDetail(db, id)).toMatchObject({
      nick: user.nick,
      mode: "verification",
      verdict: "valid",
      log: { kind: "ok", words: ["hola"], events: [EVENT] },
    });
  });

  it("an old log (without words), an unreadable one and a deleted one break nothing", async () => {
    const old = await bareGame((await newUser()).id);
    await db.insert(keystrokeLogs).values({ gameId: old, events: gzipSync(JSON.stringify([{ seq: 1, arrivedAt: 1, events: [EVENT] }])) });
    const broken = await bareGame(null);
    await db.insert(keystrokeLogs).values({ gameId: broken, events: Buffer.from("not gzip") });
    const deleted = await bareGame(null);

    expect((await gameDetail(db, old))?.log).toEqual({ kind: "ok", words: null, events: [EVENT] });
    expect(await gameDetail(db, broken)).toMatchObject({ nick: null, rejectReason: "fabricated_timing", log: { kind: "unreadable" } });
    expect((await gameDetail(db, deleted))?.log).toEqual({ kind: "missing" });
    expect(await gameDetail(db, randomUUID())).toBeNull();
  });
});
