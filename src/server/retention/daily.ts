import "server-only";
import { inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { keystrokeLogs, rhythmSamples } from "../db/schema";
import { decodeKeystrokeLog } from "../game/keystroke-log";
import { rhythmOf, weekOf } from "./rhythm";

/** Games' keystrokes and identifiers (`anon_id`, `ip_hash`) are kept for 30 days. */
export const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export interface RetentionOptions {
  /** Current time; tests fix it. */
  now?: () => Date;
  /** Rows per batch (spec 5a §3.2: 1,000). */
  batchSize?: number;
  /** Time cap for a run, in ms: whatever does not fit is left for the next day. */
  budgetMs?: number;
  /** Clock for the time cap; tests fix it. */
  clock?: () => number;
}

export interface RetentionReport {
  /** Rhythm samples saved. */
  extracted: number;
  /** Keystroke logs deleted (with a sample or, if unreadable or without events, without one). */
  deletedLogs: number;
  /** Games that have lost `anon_id` and `ip_hash`. */
  anonymizedGames: number;
  /** `false` if time ran out and work remains for tomorrow. */
  done: boolean;
}

/** A row of expired keystrokes with what the sample needs from its game and its player. */
type ExpiredLog = {
  game_id: string;
  events: Buffer;
  language: "en" | "es" | "pt";
  input_type: "physical" | "touch";
  mode: "ranked" | "verification";
  verdict: "valid" | "review" | "rejected";
  reject_reason: string | null;
  wpm: number;
  accuracy: number;
  starts_at: Date | string;
  player_status: "active" | "shadowbanned" | "banned" | "anonymous";
};

/**
 * A batch of expired keystrokes: for each one, its rhythm sample; then they are deleted (spec 5a §3.2.1).
 * Those of a current best stay. `SKIP LOCKED`: two concurrent runs do not step on each other.
 */
async function extractBatch(db: Db, cutoff: Date, limit: number): Promise<{ extracted: number; deleted: number }> {
  return db.transaction(async (tx) => {
    const logs = await tx.execute<ExpiredLog>(sql`
      select k.game_id, k.events, g.language, g.input_type, g.mode, g.verdict, g.reject_reason, g.wpm, g.accuracy,
        g.starts_at, coalesce(u.status, 'anonymous') as player_status
      from keystroke_logs k
      join games g on g.id = k.game_id
      left join users u on u.id = g.user_id
      where k.created_at < ${cutoff.toISOString()}
        and not exists (select 1 from bests b where b.game_id = k.game_id)
      order by k.created_at
      limit ${limit}
      for update of k skip locked
    `);
    if (logs.length === 0) return { extracted: 0, deleted: 0 };

    const samples = logs.flatMap((log) => {
      const decoded = decodeKeystrokeLog(Buffer.from(log.events));
      if (!decoded || decoded.events.length === 0) return [];
      return [
        {
          language: log.language,
          inputType: log.input_type,
          mode: log.mode,
          verdict: log.verdict,
          rejectReason: log.reject_reason,
          // Rounded: an exact decimal would link the sample back to its game (spec §2.2).
          wpm: Math.round(log.wpm),
          accuracy: Math.round(log.accuracy),
          playedWeek: weekOf(new Date(log.starts_at)),
          playerStatus: log.player_status,
          ...rhythmOf(decoded.events),
        },
      ];
    });
    if (samples.length > 0) await tx.insert(rhythmSamples).values(samples);
    await tx.delete(keystrokeLogs).where(inArray(keystrokeLogs.gameId, logs.map((log) => log.game_id)));
    return { extracted: samples.length, deleted: logs.length };
  });
}

/** A batch of expired games, with or without an account: they lose `anon_id` and `ip_hash` (spec 5a §3.2.2, extended in the beta-hardening spec §2). */
async function anonymizeBatch(db: Db, cutoff: Date, limit: number): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    update games set anon_id = null, ip_hash = null
    where id in (
      select id from games
      where (anon_id is not null or ip_hash is not null) and finished_at < ${cutoff.toISOString()}
      order by finished_at
      limit ${limit}
      for update skip locked
    )
    returning id
  `);
  return rows.length;
}

/**
 * The daily task (spec 5a §3): rhythm sample and deletion of keystrokes older than 30 days, and
 * deletion of `anon_id` and `ip_hash` from games older than 30 days. In batches and with a time cap.
 */
export async function runDailyRetention(db: Db, options: RetentionOptions = {}): Promise<RetentionReport> {
  const { now = () => new Date(), batchSize = 1_000, budgetMs = 20_000, clock = Date.now } = options;
  const cutoff = new Date(now().getTime() - RETENTION_DAYS * DAY_MS);
  const deadline = clock() + budgetMs;
  const report: RetentionReport = { extracted: 0, deletedLogs: 0, anonymizedGames: 0, done: false };

  for (;;) {
    if (clock() >= deadline) return report;
    const batch = await extractBatch(db, cutoff, batchSize);
    report.extracted += batch.extracted;
    report.deletedLogs += batch.deleted;
    if (batch.deleted < batchSize) break;
  }
  for (;;) {
    if (clock() >= deadline) return report;
    const anonymized = await anonymizeBatch(db, cutoff, batchSize);
    report.anonymizedGames += anonymized;
    if (anonymized < batchSize) break;
  }
  return { ...report, done: true };
}
