import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../db/client";
import { accounts, bests, games, moderationActions, reports, users, verifiedLevels } from "../db/schema";
import type { PlayerStatus } from "./sanctions";

export interface ReportedPlayer {
  id: string;
  nick: string;
  status: PlayerStatus;
  cheating: number;
  offensiveNick: number;
  latest: Date;
}

/** Panel queue (spec 4a §5.1): open reports grouped by player, most reported first. */
export async function openReportsByPlayer(db: Db, limit = 100): Promise<ReportedPlayer[]> {
  const latest = sql<Date>`max(${reports.createdAt})`;
  return db
    .select({
      id: users.id,
      nick: users.nick,
      status: users.status,
      cheating: sql<number>`count(*) filter (where ${reports.reason} = 'cheating')`.mapWith(Number),
      offensiveNick: sql<number>`count(*) filter (where ${reports.reason} = 'offensive_nick')`.mapWith(Number),
      latest: latest.mapWith((value: string | Date) => new Date(value)),
    })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.targetUserId))
    .where(eq(reports.status, "open"))
    .groupBy(users.id)
    .orderBy(desc(sql`count(*)`), desc(latest))
    .limit(limit);
}

export interface PlayerRow {
  id: string;
  nick: string;
  email: string;
  status: PlayerStatus;
  role: "user" | "admin";
  createdAt: Date;
}

/** LIKE pattern for "starts with `text`": `%`, `_` and `\` are matched literally (`_` is common in nicks). */
export function likePrefix(text: string): string {
  return `${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Panel search: exact email if there is an `@`; otherwise, nick starting with the text. Case-insensitive. */
export async function searchPlayers(db: Db, query: string, limit = 50): Promise<PlayerRow[]> {
  const text = query.trim();
  if (!text) return [];
  const where = text.includes("@")
    ? sql`lower(${users.email}) = lower(${text})`
    : sql`lower(${users.nick}) like lower(${likePrefix(text)})`;
  return db
    .select({
      id: users.id,
      nick: users.nick,
      email: users.email,
      status: users.status,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(users.nick)
    .limit(limit);
}

export interface PlayerDetail extends PlayerRow {
  country: string | null;
  providers: string[];
  records: { language: string; inputType: string; wpm: number; accuracy: number }[];
  games: {
    id: string;
    startsAt: Date;
    language: string;
    inputType: string;
    wpm: number;
    accuracy: number;
    verdict: string;
    rejectReason: string | null;
    mode: string;
  }[];
  /** Verified level per language and keyboard (spec 4b §6.4). */
  verifiedLevels: { language: string; inputType: string; wpm: number; verifiedAt: Date }[];
  reports: { id: string; reason: string; status: string; createdAt: Date; reporterNick: string | null }[];
  actions: {
    id: string;
    action: string;
    reason: string;
    details: Record<string, string> | null;
    createdAt: Date;
    adminNick: string | null;
  }[];
}

/** A player's detail page (spec 4a §5.1). */
export async function playerDetail(db: Db, id: string): Promise<PlayerDetail | null> {
  const [user] = await db
    .select({
      id: users.id,
      nick: users.nick,
      email: users.email,
      country: users.country,
      status: users.status,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!user) return null;

  const reporters = alias(users, "reporters");
  const admins = alias(users, "admins");
  const [providers, records, recentGames, received, actions, levels] = await Promise.all([
    db.select({ providerId: accounts.providerId }).from(accounts).where(eq(accounts.userId, id)),
    db
      .select({
        language: bests.language,
        inputType: bests.inputType,
        wpm: bests.wpm,
        accuracy: bests.accuracy,
      })
      .from(bests)
      .where(eq(bests.userId, id))
      .orderBy(desc(bests.score)),
    db
      .select({
        id: games.id,
        startsAt: games.startsAt,
        language: games.language,
        inputType: games.inputType,
        wpm: games.wpm,
        accuracy: games.accuracy,
        verdict: games.verdict,
        rejectReason: games.rejectReason,
        mode: games.mode,
      })
      .from(games)
      .where(eq(games.userId, id))
      .orderBy(desc(games.startsAt))
      .limit(20),
    db
      .select({
        id: reports.id,
        reason: reports.reason,
        status: reports.status,
        createdAt: reports.createdAt,
        reporterNick: reporters.nick,
      })
      .from(reports)
      .leftJoin(reporters, eq(reporters.id, reports.reporterId))
      .where(eq(reports.targetUserId, id))
      .orderBy(desc(reports.createdAt))
      .limit(50),
    db
      .select({
        id: moderationActions.id,
        action: moderationActions.action,
        reason: moderationActions.reason,
        details: moderationActions.details,
        createdAt: moderationActions.createdAt,
        adminNick: admins.nick,
      })
      .from(moderationActions)
      .leftJoin(admins, eq(admins.id, moderationActions.adminId))
      .where(eq(moderationActions.targetUserId, id))
      .orderBy(desc(moderationActions.createdAt))
      .limit(50),
    db
      .select({
        language: verifiedLevels.language,
        inputType: verifiedLevels.inputType,
        wpm: verifiedLevels.wpm,
        verifiedAt: verifiedLevels.verifiedAt,
      })
      .from(verifiedLevels)
      .where(eq(verifiedLevels.userId, id))
      .orderBy(desc(verifiedLevels.wpm)),
  ]);

  return {
    ...user,
    providers: providers.map((row) => row.providerId),
    records,
    games: recentGames,
    reports: received,
    actions,
    verifiedLevels: levels,
  };
}

/** The role is always read from the database: it is not in the session (spec §4.7). */
export async function isAdmin(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return row?.role === "admin";
}
