import "server-only";
import { and, desc, eq, gt, lte, or, sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import type { GameMode } from "@/lib/verification";
import type { Db } from "../db/client";
import { games, keystrokeLogs, recordVerifications, users } from "../db/schema";
import { decodeKeystrokeLog, type StoredKeystrokeLog } from "../game/keystroke-log";

/** Spec 4b §6.1: tres listas de hasta 100 filas; verificados y cerrados, de los últimos 7 días. */
export const RECORDS_LIMIT = 100;
export const RECORDS_DAYS = 7;

/** `expired`: `pending` con `expires_at` pasado (la caducidad se decide al leer, spec 4b §3.4). */
export type RecordState = "pending" | "verified" | "failed" | "expired";

export interface RecordRow {
  id: string;
  userId: string;
  nick: string;
  language: string;
  inputType: string;
  gameId: string;
  /** PPM de la partida del récord. */
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
  /** Fallidos o caducados. */
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
  // Con el reloj de PostgreSQL, el mismo que decide en qué lista va.
  expired: sql<boolean>`${recordVerifications.expiresAt} <= now()`,
};

/** Cola de récords del panel (spec 4b §6.1), de la más reciente a la más antigua. Solo consulta. */
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

/** El registro de pulsaciones de una partida: no hay (borrado a los 30 días), no se puede leer, o sí. */
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

/** Una partida para el panel (spec 4b §6.2), con su registro ya leído. Nunca lanza por un registro roto. */
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
