import "server-only";
import { inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { keystrokeLogs, rhythmSamples } from "../db/schema";
import { decodeKeystrokeLog } from "../game/keystroke-log";
import { rhythmOf, weekOf } from "./rhythm";

/** Las pulsaciones y los identificadores (`anon_id`, `ip_hash`) de las partidas se guardan 30 días. */
export const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export interface RetentionOptions {
  /** Hora actual; los tests la fijan. */
  now?: () => Date;
  /** Filas por lote (spec 5a §3.2: 1.000). */
  batchSize?: number;
  /** Tope de tiempo de una ejecución, en ms: lo que no dé tiempo queda para el día siguiente. */
  budgetMs?: number;
  /** Reloj para el tope de tiempo; los tests lo fijan. */
  clock?: () => number;
}

export interface RetentionReport {
  /** Extractos de ritmo guardados. */
  extracted: number;
  /** Registros de pulsaciones borrados (con extracto o, si eran ilegibles o sin eventos, sin él). */
  deletedLogs: number;
  /** Partidas que han perdido `anon_id` e `ip_hash`. */
  anonymizedGames: number;
  /** `false` si se ha acabado el tiempo y queda trabajo para mañana. */
  done: boolean;
}

/** Una fila de pulsaciones caducadas con lo que el extracto necesita de su partida y su jugador. */
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
 * Un lote de pulsaciones caducadas: de cada una, su extracto de ritmo; después se borran (spec 5a §3.2.1).
 * Las de una mejor marca vigente se quedan. `SKIP LOCKED`: dos ejecuciones a la vez no se pisan.
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
          // Redondeados: un decimal exacto reduciría el enlace del extracto con su partida (spec §2.2).
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

/** Un lote de partidas caducadas, con o sin cuenta: pierden `anon_id` e `ip_hash` (spec 5a §3.2.2, ampliado en el spec de endurecer la beta §2). */
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
 * La tarea diaria (spec 5a §3): extracto de ritmo y borrado de pulsaciones de más de 30 días, y
 * borrado de `anon_id` e `ip_hash` de las partidas de más de 30 días. Por lotes y con un tope de tiempo.
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
