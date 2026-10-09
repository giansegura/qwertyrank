import "server-only";
import { sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { RANKED_MIN_ACCURACY, encodeScore } from "../leaderboard/score";

/** Spec 4b §2.1: what would enter the top 10 of its ranking is verified. */
export const REVIEW_TOP = 10;
/** Spec 4b §2.1: unverified, a player can reach up to 110% of their verified level. */
export const VERIFIED_LEVEL_PERCENT = 110;

/** What is needed from a game to decide whether it stays in `review`. */
export interface ReviewCandidate {
  userId: string | null;
  language: TestLanguage;
  inputType: InputType;
  verdict: Verdict;
  wpm: number;
  accuracy: number;
  startsAt: Date;
}

/** Where a game stands in the ranking for its language and keyboard. */
export interface Standing {
  /** Score of the best the player already has in that ranking, or `null`. */
  ownScore: number | null;
  /** Other active players scoring higher than the better of the two (the game or their best). */
  ahead: number;
  verifiedWpm: number | null;
}

/** Does it exceed their verified level × 1.10? Without a level, any WPM. In integers: 100 × 1.1 gives 110.00000000000001. */
export function exceedsVerifiedLevel(wpm: number, verifiedWpm: number | null): boolean {
  if (verifiedWpm === null) return true;
  return Math.round(wpm * 100) * 100 > Math.round(verifiedWpm * 100) * VERIFIED_LEVEL_PERCENT;
}

/**
 * Spec 4b §2.1, points 2 and 3: exceeds their level, improves their best and would be in the top 10 of its
 * ranking. `score` is the game's composite score.
 */
export function shouldReview(score: number, wpm: number, standing: Standing): boolean {
  if (!exceedsVerifiedLevel(wpm, standing.verifiedWpm)) return false;
  return (standing.ownScore === null || score > standing.ownScore) && standing.ahead < REVIEW_TOP;
}

/**
 * A single query (spec 4b §9): their best in the ranking for its language and keyboard, how many active
 * players are ahead (counted in PostgreSQL with the `bests` index) and their verified level.
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
 * Spec 4b §2.1: does the game stay in `review`? If so, with the position it would have. Without an account,
 * not valid or under 90% nothing is queried: it follows the usual path.
 */
export async function decideReview(db: DbExecutor, game: ReviewCandidate): Promise<{ rank: number } | null> {
  if (game.userId === null || game.verdict !== "valid" || game.accuracy < RANKED_MIN_ACCURACY) return null;
  const score = encodeScore({ wpm: game.wpm, accuracy: game.accuracy, achievedAt: game.startsAt });
  const standing = await boardStanding(db, { ...game, userId: game.userId }, score);
  return shouldReview(score, game.wpm, standing) ? { rank: standing.ahead + 1 } : null;
}
