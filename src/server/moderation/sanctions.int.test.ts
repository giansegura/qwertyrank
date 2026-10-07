import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { periodKey } from "@/lib/leaderboard/periods";
import { createDb } from "../db/client";
import { accounts, bannedIdentities, moderationActions, reports, users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { liveBests } from "../leaderboard/live";
import { createLeaderboardStore, currentBoard, type Board, type BoardScore, type LeaderboardStore } from "../leaderboard/store";
import { checkNick } from "../profile/nick";
import { createNickAvailability } from "../profile/nick-reservation";
import { createRedis } from "../redis";
import { identityHash } from "./identities";
import { createSanctions } from "./sanctions";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}sanctions-${randomUUID().slice(0, 8)}:`;
const store = createLeaderboardStore(redis, prefix);
/** Lo que las sanciones escriben en Redis: un ranking caducado no deja rastro en Redis, pero sí aquí. */
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
const TODAY = currentBoard("en", "physical", "day");
const ALL: Board = { language: "en", inputType: "physical", period: "all", key: "all" };

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
  return { ...row, email };
}

/** Una partida válida guardada (con sus marcas) y publicada en Redis, como al terminarla. */
async function playAt(userId: string, startsAt: Date) {
  await saveGame({
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: "en",
    inputType: "physical",
    wpm: 100,
    rawWpm: 100,
    accuracy: 98,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    batches: [],
  });
  await store.add(await liveBests(db, new Date(), userId));
}

describe("sanciones", () => {
  it("shadow-ban: registra la acción, cierra sus denuncias y le saca de todos los rankings", async () => {
    const [admin, player, reporter] = [await newUser("admin"), await newUser(), await newUser()];
    await playAt(player.id, new Date());
    expect(await store.position(TODAY, player.id)).not.toBeNull();
    await db.insert(reports).values({ reporterId: reporter.id, targetUserId: player.id, reason: "cheating" });
    const before = changes;

    expect(await sanctions.setStatus(admin.id, player.id, "shadowbanned", "bot evidente")).toEqual({ kind: "ok" });

    const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, player.id));
    expect(row.status).toBe("shadowbanned");
    const actions = await db
      .select({ adminId: moderationActions.adminId, action: moderationActions.action, reason: moderationActions.reason })
      .from(moderationActions)
      .where(eq(moderationActions.targetUserId, player.id));
    expect(actions).toEqual([{ adminId: admin.id, action: "shadowban", reason: "bot evidente" }]);
    expect(await store.position(TODAY, player.id)).toBeNull();
    expect(await store.position(ALL, player.id)).toBeNull();
    const [report] = await db.select().from(reports).where(eq(reports.targetUserId, player.id));
    expect(report).toMatchObject({ status: "actioned", resolvedBy: admin.id });
    expect(changes).toBe(before + 1);

    expect(await sanctions.setStatus(admin.id, player.id, "shadowbanned", "otra vez")).toEqual({
      kind: "rejected",
      why: "unchanged",
    });
  });

  it("si Redis falla tras confirmar la sanción: el estado queda guardado, las páginas se revalidan y se avisa", async () => {
    const [admin, player] = [await newUser("admin"), await newUser()];
    const failing = createSanctions({
      db,
      store: {
        ...store,
        async remove() {
          throw new Error("redis caído");
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

    expect(await failing.setStatus(admin.id, player.id, "shadowbanned", "trampas")).toEqual({ kind: "redis_failed" });
    error.mockRestore();
    const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, player.id));
    expect(row.status).toBe("shadowbanned");
    expect(changes).toBe(before + 1);
  });

  it("ban: guarda los hashes de su email y de su Google; restaurar los quita y le devuelve a los rankings", async () => {
    const [admin, player] = [await newUser("admin"), await newUser()];
    await playAt(player.id, new Date());
    const googleId = randomUUID();
    await db.insert(accounts).values({ userId: player.id, accountId: googleId, providerId: "google" });

    await sanctions.setStatus(admin.id, player.id, "banned", "trampas");
    const banned = await db
      .select({ hash: bannedIdentities.hash })
      .from(bannedIdentities)
      .where(eq(bannedIdentities.userId, player.id));
    expect(banned.map((row) => row.hash).sort()).toEqual(
      [identityHash("email", player.email, SECRET), identityHash("google", googleId, SECRET)].sort(),
    );
    expect(await store.position(TODAY, player.id)).toBeNull();

    expect(await sanctions.setStatus(admin.id, player.id, "active", "era un error")).toEqual({ kind: "ok" });
    expect(await db.select().from(bannedIdentities).where(eq(bannedIdentities.userId, player.id))).toEqual([]);
    expect(await store.position(TODAY, player.id)).not.toBeNull();
  });

  it("al restaurar no resucita rankings caducados", async () => {
    const [admin, player] = [await newUser("admin"), await newUser()];
    // Hace 20 días: su ranking de día caducó a los 8; el de semana vive 6 semanas y sigue ahí.
    const old = new Date(Date.now() - 20 * 86_400_000);
    await playAt(player.id, old);
    await sanctions.setStatus(admin.id, player.id, "shadowbanned", "revisar");
    added.length = 0;
    await sanctions.setStatus(admin.id, player.id, "active", "revisado");
    // Redis borraría al momento un ranking caducado reescrito (EXPIREAT en el pasado): se mira lo que se escribe.
    const restored = added.map((entry) => entry.board);
    const oldDay: Board = { language: "en", inputType: "physical", period: "day", key: periodKey("day", old) };
    expect(restored).not.toContainEqual(oldDay);
    expect(restored.map((board) => board.period).sort()).toEqual(["all", "month", "week", "year"]);
    expect(await store.position(ALL, player.id)).not.toBeNull();
  });

  it("no se puede actuar sobre uno mismo, sobre otro admin ni sobre quien no existe", async () => {
    const [admin, other] = [await newUser("admin"), await newUser("admin")];
    expect(await sanctions.setStatus(admin.id, admin.id, "banned", "x")).toEqual({ kind: "rejected", why: "self" });
    expect(await sanctions.setStatus(admin.id, other.id, "banned", "x")).toEqual({ kind: "rejected", why: "admin" });
    expect(await sanctions.setStatus(admin.id, randomUUID(), "banned", "x")).toEqual({ kind: "rejected", why: "not_found" });
    expect(await sanctions.resetNick(admin.id, other.id, "x")).toEqual({ kind: "rejected", why: "admin" });
  });

  it("cambiar el nick: uno automático, registrado con el anterior; cierra solo las denuncias de nick", async () => {
    const [admin, player, reporter] = [await newUser("admin"), await newUser(), await newUser()];
    await db.insert(reports).values([
      { reporterId: reporter.id, targetUserId: player.id, reason: "offensive_nick" },
      { reporterId: reporter.id, targetUserId: player.id, reason: "cheating" },
    ]);
    const before = changes;

    expect(await sanctions.resetNick(admin.id, player.id, "nick ofensivo")).toEqual({ kind: "ok" });

    const [row] = await db.select({ nick: users.nick }).from(users).where(eq(users.id, player.id));
    expect(row.nick).toMatch(/^player_\d{2,4}$/);
    expect(checkNick(row.nick)).toBeNull();
    const [action] = await db.select().from(moderationActions).where(eq(moderationActions.targetUserId, player.id));
    expect(action).toMatchObject({ action: "reset_nick", reason: "nick ofensivo", details: { from: player.nick, to: row.nick } });
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

  it("descartar las denuncias abiertas", async () => {
    const [admin, player, reporter] = [await newUser("admin"), await newUser(), await newUser()];
    await db.insert(reports).values({ reporterId: reporter.id, targetUserId: player.id, reason: "cheating" });
    await sanctions.dismissReports(admin.id, player.id);
    const [report] = await db.select().from(reports).where(eq(reports.targetUserId, player.id));
    expect(report).toMatchObject({ status: "dismissed", resolvedBy: admin.id });
  });
});
