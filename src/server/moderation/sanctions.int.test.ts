import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { accounts, bannedIdentities, moderationActions, reports, users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { activeBests } from "../leaderboard/live";
import { createLeaderboardStore, type Board, type BoardScore, type LeaderboardStore } from "../leaderboard/store";
import { checkNick } from "../profile/nick";
import { createNickAvailability } from "../profile/nick-reservation";
import { createRedis } from "../redis";
import { identityHash } from "./identities";
import { createSanctions } from "./sanctions";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}sanctions-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
/** What the sanctions write to Redis. */
const added: BoardScore[] = [];
const watchedStore: LeaderboardStore = {
  ...store,
  async add(entries) {
    added.push(...entries);
    await store.add(entries);
  },
};
const SECRET = process.env.IP_HASH_SECRET!;
let changes = 0;
const sanctions = createSanctions({
  db,
  store: watchedStore,
  identitySecret: SECRET,
  isNickTaken: createNickAvailability(db, redis, prefix),
  onPlayerChanged: () => {
    changes++;
  },
});
const saveGame = createSaveGame(db);
const BOARD: Board = { language: "en", inputType: "physical" };

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

async function newUser(role: "user" | "admin" = "user") {
  const email = `${randomUUID()}@example.com`;
  const [row] = await db
    .insert(users)
    .values({ name: "", email, nick: `s_${randomUUID().slice(0, 8)}`, role })
    .returning({ id: users.id, nick: users.nick });
  await verifyEverywhere(db, row.id);
  return { ...row, email };
}

/** A valid game saved (with its best) and published to Redis, as when it finishes. */
async function playAt(userId: string, startsAt: Date, board: Board = BOARD) {
  await saveGame({
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: board.language,
    inputType: board.inputType,
    wpm: 100,
    rawWpm: 100,
    accuracy: 98,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
  });
  await store.add(await activeBests(db, userId));
}

describe("sanctions", () => {
  it("shadow ban: logs the action, closes their reports and removes them from every ranking", async () => {
    const [admin, player, reporter] = [await newUser("admin"), await newUser(), await newUser()];
    await playAt(player.id, new Date());
    expect(await store.position(BOARD, player.id)).not.toBeNull();
    await db.insert(reports).values({ reporterId: reporter.id, targetUserId: player.id, reason: "cheating" });
    const before = changes;

    expect(await sanctions.setStatus(admin.id, player.id, "shadowbanned", "obvious bot")).toEqual({ kind: "ok" });

    const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, player.id));
    expect(row.status).toBe("shadowbanned");
    const actions = await db
      .select({ adminId: moderationActions.adminId, action: moderationActions.action, reason: moderationActions.reason })
      .from(moderationActions)
      .where(eq(moderationActions.targetUserId, player.id));
    expect(actions).toEqual([{ adminId: admin.id, action: "shadowban", reason: "obvious bot" }]);
    expect(await store.position(BOARD, player.id)).toBeNull();
    const [report] = await db.select().from(reports).where(eq(reports.targetUserId, player.id));
    expect(report).toMatchObject({ status: "actioned", resolvedBy: admin.id });
    expect(changes).toBe(before + 1);

    expect(await sanctions.setStatus(admin.id, player.id, "shadowbanned", "again")).toEqual({
      kind: "rejected",
      why: "unchanged",
    });
  });

  it("if Redis fails after committing the sanction: the status stays saved, the pages are revalidated and it reports it", async () => {
    const [admin, player] = [await newUser("admin"), await newUser()];
    const failing = createSanctions({
      db,
      store: {
        ...store,
        async remove() {
          throw new Error("redis down");
        },
      },
      identitySecret: SECRET,
      isNickTaken: async () => false,
      onPlayerChanged: () => {
        changes++;
      },
    });
    const before = changes;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await failing.setStatus(admin.id, player.id, "shadowbanned", "cheating")).toEqual({ kind: "redis_failed" });
    error.mockRestore();
    const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, player.id));
    expect(row.status).toBe("shadowbanned");
    expect(changes).toBe(before + 1);
  });

  it("ban: stores the hashes of their email and their Google; restoring removes them and puts them back in the rankings", async () => {
    const [admin, player] = [await newUser("admin"), await newUser()];
    await playAt(player.id, new Date());
    const googleId = randomUUID();
    await db.insert(accounts).values({ userId: player.id, accountId: googleId, providerId: "google" });

    await sanctions.setStatus(admin.id, player.id, "banned", "cheating");
    const banned = await db
      .select({ hash: bannedIdentities.hash })
      .from(bannedIdentities)
      .where(eq(bannedIdentities.userId, player.id));
    expect(banned.map((row) => row.hash).sort()).toEqual(
      [identityHash("email", player.email, SECRET), identityHash("google", googleId, SECRET)].sort(),
    );
    expect(await store.position(BOARD, player.id)).toBeNull();

    expect(await sanctions.setStatus(admin.id, player.id, "active", "it was a mistake")).toEqual({ kind: "ok" });
    expect(await db.select().from(bannedIdentities).where(eq(bannedIdentities.userId, player.id))).toEqual([]);
    expect(await store.position(BOARD, player.id)).not.toBeNull();
  });

  it("on restore they return to all their rankings, also with bests from months ago", async () => {
    const [admin, player] = [await newUser("admin"), await newUser()];
    const touch: Board = { language: "es", inputType: "touch" };
    await playAt(player.id, new Date(Date.now() - 200 * 86_400_000));
    await playAt(player.id, new Date(), touch);
    await sanctions.setStatus(admin.id, player.id, "shadowbanned", "to review");
    expect(await store.position(touch, player.id)).toBeNull();
    added.length = 0;
    await sanctions.setStatus(admin.id, player.id, "active", "reviewed");
    expect(added.map((entry) => entry.board)).toEqual(expect.arrayContaining([BOARD, touch]));
    expect(added).toHaveLength(2);
    expect(await store.position(BOARD, player.id)).not.toBeNull();
    expect(await store.position(touch, player.id)).not.toBeNull();
  });

  it("cannot act on oneself, on another admin or on someone who does not exist", async () => {
    const [admin, other] = [await newUser("admin"), await newUser("admin")];
    expect(await sanctions.setStatus(admin.id, admin.id, "banned", "x")).toEqual({ kind: "rejected", why: "self" });
    expect(await sanctions.setStatus(admin.id, other.id, "banned", "x")).toEqual({ kind: "rejected", why: "admin" });
    expect(await sanctions.setStatus(admin.id, randomUUID(), "banned", "x")).toEqual({ kind: "rejected", why: "not_found" });
    expect(await sanctions.resetNick(admin.id, other.id, "x")).toEqual({ kind: "rejected", why: "admin" });
  });

  it("changing the nick: an automatic one, logged with the previous one; closes only the nick reports", async () => {
    const [admin, player, reporter] = [await newUser("admin"), await newUser(), await newUser()];
    await db.insert(reports).values([
      { reporterId: reporter.id, targetUserId: player.id, reason: "offensive_nick" },
      { reporterId: reporter.id, targetUserId: player.id, reason: "cheating" },
    ]);
    const before = changes;

    expect(await sanctions.resetNick(admin.id, player.id, "offensive nick")).toEqual({ kind: "ok" });

    const [row] = await db.select({ nick: users.nick }).from(users).where(eq(users.id, player.id));
    expect(row.nick).toMatch(/^player_\d{2,4}$/);
    expect(checkNick(row.nick)).toBeNull();
    const [action] = await db.select().from(moderationActions).where(eq(moderationActions.targetUserId, player.id));
    expect(action).toMatchObject({ action: "reset_nick", reason: "offensive nick", details: { from: player.nick, to: row.nick } });
    const statuses = await db
      .select({ reason: reports.reason, status: reports.status })
      .from(reports)
      .where(eq(reports.targetUserId, player.id));
    expect(statuses).toEqual(
      expect.arrayContaining([
        { reason: "offensive_nick", status: "actioned" },
        { reason: "cheating", status: "open" },
      ]),
    );
    expect(changes).toBe(before + 1);
  });

  it("dismissing the open reports", async () => {
    const [admin, player, reporter] = [await newUser("admin"), await newUser(), await newUser()];
    await db.insert(reports).values({ reporterId: reporter.id, targetUserId: player.id, reason: "cheating" });
    await sanctions.dismissReports(admin.id, player.id);
    const [report] = await db.select().from(reports).where(eq(reports.targetUserId, player.id));
    expect(report).toMatchObject({ status: "dismissed", resolvedBy: admin.id });
  });
});
