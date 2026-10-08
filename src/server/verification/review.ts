import "server-only";
import { sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { RANKED_MIN_ACCURACY, encodeScore } from "../leaderboard/score";

/** Spec 4b §2.1: se verifica lo que entraría en el top 10 de su ranking. */
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

/** Cómo queda una partida en el ranking de su idioma y teclado. */
export interface Standing {
  /** Puntuación de la marca que ya tiene el jugador en ese ranking, o `null`. */
  ownScore: number | null;
  /** Otros jugadores activos con más puntuación que la mejor de las dos (la partida o su marca). */
  ahead: number;
  verifiedWpm: number | null;
}

/** ¿Supera su nivel verificado × 1,10? Sin nivel, cualquier PPM. En enteros: 100 × 1,1 da 110,00000000000001. */
export function exceedsVerifiedLevel(wpm: number, verifiedWpm: number | null): boolean {
  if (verifiedWpm === null) return true;
  return Math.round(wpm * 100) * 100 > Math.round(verifiedWpm * 100) * VERIFIED_LEVEL_PERCENT;
}

/**
 * Spec 4b §2.1, puntos 2 y 3: supera su nivel, mejora su marca y quedaría entre los 10 primeros de su
 * ranking. `score` es la puntuación compuesta de la partida.
 */
export function shouldReview(score: number, wpm: number, standing: Standing): boolean {
  if (!exceedsVerifiedLevel(wpm, standing.verifiedWpm)) return false;
  return (standing.ownScore === null || score > standing.ownScore) && standing.ahead < REVIEW_TOP;
}

/**
 * Una sola consulta (spec 4b §9): su marca en el ranking de su idioma y teclado, cuántos jugadores
 * activos tiene por delante (contados en PostgreSQL con el índice de `bests`) y su nivel verificado.
 */
export async function boardStanding(
  db: DbExecutor,
  game: Pick<ReviewCandidate, "language" | "inputType"> & { userId: string },
  score: number,
): Promise<Standing> {
  const [row] = await db.execute<{ own_score: string | null; ahead: string; level: number | null }>(sql`
    select own.score as own_score, (
      select count(*) from bests b join users u on u.id = b.user_id
      where b.language = ${game.language} and b.input_type = ${game.inputType}
        and b.user_id <> ${game.userId} and u.status = 'active'
        and b.score > greatest(${score}::bigint, coalesce(own.score, 0))
    ) as ahead, (
      select wpm from verified_levels
      where user_id = ${game.userId} and language = ${game.language} and input_type = ${game.inputType}
    ) as level
    from (values (1)) as one(x)
    left join bests own on own.user_id = ${game.userId} and own.language = ${game.language}
      and own.input_type = ${game.inputType}
  `);
  return {
    ownScore: row.own_score === null ? null : Number(row.own_score),
    ahead: Number(row.ahead),
    verifiedWpm: row.level,
  };
}

/**
 * Spec 4b §2.1: ¿queda la partida en `review`? Si es así, con la posición que tendría. Sin cuenta, no
 * válida o con menos del 90 % no se consulta nada: sigue el camino de siempre.
 */
export async function decideReview(db: DbExecutor, game: ReviewCandidate): Promise<{ rank: number } | null> {
  if (game.userId === null || game.verdict !== "valid" || game.accuracy < RANKED_MIN_ACCURACY) return null;
  const score = encodeScore({ wpm: game.wpm, accuracy: game.accuracy, achievedAt: game.startsAt });
  const standing = await boardStanding(db, { ...game, userId: game.userId }, score);
  return shouldReview(score, game.wpm, standing) ? { rank: standing.ahead + 1 } : null;
}
