import "server-only";
import { sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import { VISIBLE_PERIODS, periodKeys, type VisiblePeriod } from "@/lib/leaderboard/periods";
import type { PeriodRanks } from "@/lib/leaderboard/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { RANKED_MIN_ACCURACY, encodeScore } from "../leaderboard/score";

/** Spec 4b §2.1: se verifica lo que entraría en un top 10 visible. */
export const REVIEW_TOP = 10;
/** Spec 4b §2.1: sin verificar, un jugador puede llegar hasta el 110 % de su nivel verificado. */
export const VERIFIED_LEVEL_PERCENT = 110;

/** Lo que hace falta de una partida para decidir si queda en `review`. */
export interface ReviewCandidate {
  userId: string | null;
  language: TestLanguage;
  inputType: InputType;
  verdict: Verdict;
  wpm: number;
  accuracy: number;
  startsAt: Date;
}

/** Cómo queda una partida en un ranking abierto. */
export interface BoardStanding {
  period: VisiblePeriod;
  /** Puntuación de la marca que ya tiene el jugador en ese ranking, o `null`. */
  ownScore: number | null;
  /** Otros jugadores activos con más puntuación que la mejor de las dos (la partida o su marca). */
  ahead: number;
}

export interface Standings {
  boards: BoardStanding[];
  verifiedWpm: number | null;
}

/**
 * Rankings visibles que siguen abiertos para una partida: los de su periodo que son también el de
 * ahora (como en `computeRanking`). "Siempre" siempre lo está.
 */
export function openVisibleBoards(startsAt: Date, now: Date): { period: VisiblePeriod; key: string }[] {
  const keys = periodKeys(startsAt);
  const current = periodKeys(now);
  return VISIBLE_PERIODS.filter((period) => keys[period] === current[period]).map((period) => ({
    period,
    key: keys[period],
  }));
}

/** ¿Supera su nivel verificado × 1,10? Sin nivel, cualquier PPM. En enteros: 100 × 1,1 da 110,00000000000001. */
export function exceedsVerifiedLevel(wpm: number, verifiedWpm: number | null): boolean {
  if (verifiedWpm === null) return true;
  return Math.round(wpm * 100) * 100 > Math.round(verifiedWpm * 100) * VERIFIED_LEVEL_PERCENT;
}

/**
 * Spec 4b §2.1, puntos 2 y 3: supera su nivel y, en algún ranking abierto, mejora su marca y quedaría
 * entre los 10 primeros. `score` es la puntuación compuesta de la partida.
 */
export function shouldReview(score: number, wpm: number, standings: Standings): boolean {
  if (!exceedsVerifiedLevel(wpm, standings.verifiedWpm)) return false;
  return standings.boards.some(
    (board) => (board.ownScore === null || score > board.ownScore) && board.ahead < REVIEW_TOP,
  );
}

/** Posición que tendría en cada ranking abierto (spec 4b §2.4). */
export function reviewRanks(boards: BoardStanding[]): PeriodRanks {
  return Object.fromEntries(boards.map((board) => [board.period, board.ahead + 1])) as PeriodRanks;
}

/**
 * Una sola consulta (spec 4b §9): en cada ranking abierto, su marca y cuántos jugadores activos tiene
 * por delante, contados en PostgreSQL con el índice de `period_bests`; y su nivel verificado.
 */
export async function boardStandings(
  db: DbExecutor,
  game: Pick<ReviewCandidate, "language" | "inputType" | "startsAt"> & { userId: string },
  score: number,
  now: Date,
): Promise<Standings> {
  const boards = openVisibleBoards(game.startsAt, now);
  const rows = await db.execute<{ period: VisiblePeriod; own_score: string | null; ahead: string; level: number | null }>(sql`
    select b.period, own.score as own_score, (
      select count(*) from period_bests pb join users u on u.id = pb.user_id
      where pb.language = ${game.language} and pb.input_type = ${game.inputType}
        and pb.period_type = b.period and pb.period_key = b.key
        and pb.user_id <> ${game.userId} and u.status = 'active'
        and pb.score > greatest(${score}::bigint, coalesce(own.score, 0))
    ) as ahead, (
      select wpm from verified_levels
      where user_id = ${game.userId} and language = ${game.language} and input_type = ${game.inputType}
    ) as level
    from (values ${sql.join(
      boards.map((board) => sql`(${board.period}, ${board.key})`),
      sql`, `,
    )}) as b(period, key)
    left join period_bests own on own.user_id = ${game.userId} and own.language = ${game.language}
      and own.input_type = ${game.inputType} and own.period_type = b.period and own.period_key = b.key
  `);
  return {
    boards: rows.map((row) => ({
      period: row.period,
      ownScore: row.own_score === null ? null : Number(row.own_score),
      ahead: Number(row.ahead),
    })),
    verifiedWpm: rows[0]?.level ?? null,
  };
}

/**
 * Spec 4b §2.1: ¿queda la partida en `review`? Si es así, con sus posiciones. Sin cuenta, no válida o
 * con menos del 90 % no se consulta nada: sigue el camino de siempre.
 */
export async function decideReview(
  db: DbExecutor,
  game: ReviewCandidate,
  now: Date,
): Promise<{ ranks: PeriodRanks } | null> {
  if (game.userId === null || game.verdict !== "valid" || game.accuracy < RANKED_MIN_ACCURACY) return null;
  const score = encodeScore({ wpm: game.wpm, accuracy: game.accuracy, achievedAt: game.startsAt });
  const standings = await boardStandings(db, { ...game, userId: game.userId }, score, now);
  return shouldReview(score, game.wpm, standings) ? { ranks: reviewRanks(standings.boards) } : null;
}
