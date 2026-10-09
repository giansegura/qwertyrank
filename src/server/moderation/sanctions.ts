import "server-only";
import { and, eq } from "drizzle-orm";
import type { ReportReason } from "@/lib/reports";
import type { Db, DbExecutor } from "../db/client";
import { bannedIdentities, moderationActions, reports, users } from "../db/schema";
import { userBoards } from "../leaderboard/bests";
import { activeBests } from "../leaderboard/live";
import type { LeaderboardStore } from "../leaderboard/store";
import { findFreeNick } from "../profile/nick";
import { identitiesOf } from "./identities";

export type PlayerStatus = "active" | "shadowbanned" | "banned";
export type SanctionRejection = "not_found" | "admin" | "self" | "unchanged";
/** `redis_failed`: PostgreSQL already has the sanction, but Redis was not updated (run `pnpm redis:rebuild`). */
export type SanctionOutcome = { kind: "ok" } | { kind: "redis_failed" } | { kind: "rejected"; why: SanctionRejection };

export interface SanctionsDeps {
  db: Db;
  store: LeaderboardStore;
  /** Their cached pages change; in production, `revalidatePlayerPages`. */
  onPlayerChanged: () => void;
  /** Key for the hashes of banned identities (spec 4a §3.3). */
  identitySecret: string;
  /** With reservation (spec 4a §6.5): `createNickAvailability`. */
  isNickTaken: (nick: string) => Promise<boolean>;
  random?: () => number;
}

const ACTION_FOR = { active: "restore", shadowbanned: "shadowban", banned: "ban" } as const;

async function resolveOpenReports(
  db: DbExecutor,
  adminId: string,
  targetId: string,
  status: "dismissed" | "actioned",
  reason?: ReportReason,
): Promise<void> {
  await db
    .update(reports)
    .set({ status, resolvedBy: adminId, resolvedAt: new Date() })
    .where(
      and(eq(reports.targetUserId, targetId), eq(reports.status, "open"), reason ? eq(reports.reason, reason) : undefined),
    );
}

/** Moderation sanctions (spec 4a §3). Only used by the panel and the scripts. */
export function createSanctions(deps: SanctionsDeps) {
  const random = deps.random ?? Math.random;

  async function findTarget(
    adminId: string,
    targetId: string,
  ): Promise<{ status: PlayerStatus; nick: string } | Exclude<SanctionRejection, "unchanged">> {
    if (adminId === targetId) return "self";
    const [row] = await deps.db
      .select({ role: users.role, status: users.status, nick: users.nick })
      .from(users)
      .where(eq(users.id, targetId));
    if (!row) return "not_found";
    if (row.role === "admin") return "admin";
    return row;
  }

  /** Shadow ban, ban or back to active (spec 4a §3.1). */
  async function setStatus(adminId: string, targetId: string, status: PlayerStatus, reason: string): Promise<SanctionOutcome> {
    const target = await findTarget(adminId, targetId);
    if (typeof target === "string") return { kind: "rejected", why: target };
    if (target.status === status) return { kind: "rejected", why: "unchanged" };

    await deps.db.transaction(async (tx) => {
      await tx.update(users).set({ status }).where(eq(users.id, targetId));
      await tx.insert(moderationActions).values({ adminId, targetUserId: targetId, action: ACTION_FOR[status], reason });
      if (status === "banned") {
        const identities = await identitiesOf(tx, targetId, deps.identitySecret);
        await tx
          .insert(bannedIdentities)
          .values(identities.map((identity) => ({ ...identity, userId: targetId })))
          .onConflictDoNothing();
      } else if (target.status === "banned") {
        await tx.delete(bannedIdentities).where(eq(bannedIdentities.userId, targetId));
      }
      if (status !== "active") await resolveOpenReports(tx, adminId, targetId, "actioned");
    });

    // PostgreSQL is already up to date: Redis is cleaned up or rewritten with their bests.
    // The pages are revalidated even if Redis fails: the sanction is already committed.
    try {
      if (status === "active") await deps.store.add(await activeBests(deps.db, targetId));
      else await deps.store.remove(targetId, await userBoards(deps.db, targetId));
    } catch (error) {
      console.error("setStatus: PostgreSQL updated but Redis failed", error);
      return { kind: "redis_failed" };
    } finally {
      deps.onPlayerChanged();
    }
    return { kind: "ok" };
  }

  /** Replaces an offensive nick with an automatic one (spec 4a §3.2), keeping the previous one in the log. */
  async function resetNick(adminId: string, targetId: string, reason: string): Promise<SanctionOutcome> {
    const target = await findTarget(adminId, targetId);
    if (typeof target === "string") return { kind: "rejected", why: target };
    // Not derived from the email: it could repeat the offensive part.
    const nick = await findFreeNick("player", deps.isNickTaken, random);
    await deps.db.transaction(async (tx) => {
      await tx.update(users).set({ nick }).where(eq(users.id, targetId));
      await tx.insert(moderationActions).values({
        adminId,
        targetUserId: targetId,
        action: "reset_nick",
        reason,
        details: { from: target.nick, to: nick },
      });
      await resolveOpenReports(tx, adminId, targetId, "actioned", "offensive_nick");
    });
    deps.onPlayerChanged();
    return { kind: "ok" };
  }

  /** Closes the open reports against a player without action. */
  async function dismissReports(adminId: string, targetId: string): Promise<void> {
    await resolveOpenReports(deps.db, adminId, targetId, "dismissed");
  }

  return { setStatus, resetNick, dismissReports };
}

export type Sanctions = ReturnType<typeof createSanctions>;
