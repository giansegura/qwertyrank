import "server-only";
import { and, desc, eq, gt, lte, or, sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import type { GameMode } from "@/lib/verification";
import type { Db } from "../db/client";
import { games, keystrokeLogs, recordVerifications, users } from "../db/schema";
import { decodeKeystrokeLog, type StoredKeystrokeLog } from "../game/keystroke-log";

/** Spec 4b §6.1: three lists of up to 100 rows; verified and closed ones, from the last 7 days. */
export const RECORDS_LIMIT = 100;
export const RECORDS_DAYS = 7;

/** `expired`: `pending` with a past `expires_at` (expiry is decided on read, spec 4b §3.4). */
export type RecordState = "pending" | "verified" | "failed" | "expired";

export interface RecordRow {
  id: string;
  userId: string;
  nick: string;
  language: string;
  inputType: string;
  gameId: string;
  /** Wpm of the record's game. */
  wpm: number;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
  state: RecordState;
}

export interface RecordQueues {
  pending: RecordRow[];
  verified: RecordRow[];
  /** Failed or expired. */
  closed: RecordRow[];
}

const FIELDS = {
  id: recordVerifications.id,
  userId: recordVerifications.userId,
  nick: users.nick,
  language: recordVerifications.language,
  inputType: recordVerifications.inputType,
  gameId: recordVerifications.gameId,
  wpm: games.wpm,
  attempts: recordVerifications.attempts,
  createdAt: recordVerifications.createdAt,
  expiresAt: recordVerifications.expiresAt,
  resolvedAt: recordVerifications.resolvedAt,
  status: recordVerifications.status,
  // With the PostgreSQL clock, the same one that decides which list it goes in.
  expired: sql<boolean>`${recordVerifications.expiresAt} <= now()`,
};

/** Panel record queue (spec 4b §6.1), from newest to oldest. Read-only. */
export async function recordQueues(db: Db, limit = RECORDS_LIMIT): Promise<RecordQueues> {
  const rows = () =>
    db
      .select(FIELDS)
      .from(recordVerifications)
      .innerJoin(users, eq(users.id, recordVerifications.userId))
      .innerJoin(games, eq(games.id, recordVerifications.gameId));
  const since = sql`now() - ${sql.raw(`interval '${RECORDS_DAYS} days'`)}`;
  const expired = and(eq(recordVerifications.status, "pending"), lte(recordVerifications.expiresAt, sql`now()`));

  const [pending, verified, closed] = await Promise.all([
    rows()
      .where(and(eq(recordVerifications.status, "pending"), gt(recordVerifications.expiresAt, sql`now()`)))
      .orderBy(desc(recordVerifications.createdAt))
      .limit(limit),
    rows()
      .where(and(eq(recordVerifications.status, "verified"), gt(recordVerifications.resolvedAt, since)))
      .orderBy(desc(recordVerifications.resolvedAt))
      .limit(limit),
    rows()
      .where(
        or(
          and(eq(recordVerifications.status, "failed"), gt(recordVerifications.resolvedAt, since)),
          and(expired, gt(recordVerifications.expiresAt, since)),
        ),
      )
      .orderBy(desc(sql`coalesce(${recordVerifications.resolvedAt}, ${recordVerifications.expiresAt})`))
      .limit(limit),
  ]);

  const withState = (list: typeof pending): RecordRow[] =>
    list.map(({ status, expired: isExpired, ...row }) => ({
      ...row,
      state: status === "pending" && isExpired ? "expired" : status,
    }));
  return { pending: withState(pending), verified: withState(verified), closed: withState(closed) };
}

/** A game's keystroke log: there is none (deleted after 30 days), it can't be read, or it can. */
export type GameLog = { kind: "missing" } | { kind: "unreadable" } | ({ kind: "ok" } & StoredKeystrokeLog);

export interface GameDetail {
  id: string;
  userId: string | null;
  nick: string | null;
  language: string;
  inputType: InputType;
  mode: GameMode;
  verdict: Verdict;
  rejectReason: string | null;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  riskScore: number;
  startsAt: Date;
  log: GameLog;
}

/** A game for the panel (spec 4b §6.2), with its log already read. Never throws because of a broken log. */
export async function gameDetail(db: Db, id: string): Promise<GameDetail | null> {
  const [row] = await db
    .select({
      id: games.id,
      userId: games.userId,
      nick: users.nick,
      language: games.language,
      inputType: games.inputType,
      mode: games.mode,
      verdict: games.verdict,
      rejectReason: games.rejectReason,
      wpm: games.wpm,
      rawWpm: games.rawWpm,
      accuracy: games.accuracy,
      riskScore: games.riskScore,
      startsAt: games.startsAt,
      events: keystrokeLogs.events,
    })
    .from(games)
    .leftJoin(users, eq(users.id, games.userId))
    .leftJoin(keystrokeLogs, eq(keystrokeLogs.gameId, games.id))
    .where(eq(games.id, id));
  if (!row) return null;
  const { events, ...game } = row;
  if (!events) return { ...game, log: { kind: "missing" } };
  const decoded = decodeKeystrokeLog(events);
  return { ...game, log: decoded ? { kind: "ok", ...decoded } : { kind: "unreadable" } };
}
