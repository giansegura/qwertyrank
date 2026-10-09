import type { PendingVerification } from "../verification";

/**
 * The ranking of a game, when it finishes or is claimed, with its position in the ranking of its language and
 * keyboard (1 = the best):
 * - `ranked`: with an account; `improved` if it is their new best;
 * - `would_rank`: anonymous; the position it would have, without writing to the ranking (spec §5.6);
 * - `low_accuracy`: valid, but with less than 90 % accuracy;
 * - `unranked`: invalid game;
 * - `unavailable`: could not be computed (Redis down), although the game is saved; `canSave` if it is
 *   anonymous and can be saved to an account;
 * - `review`: it would enter a top 10 and awaits its verification (spec 4b §2.4); `rank`, the position it
 *   would have, counted in PostgreSQL.
 */
export type GameRanking =
  | { kind: "ranked"; rank: number; improved: boolean }
  | { kind: "review"; rank: number; verification: PendingVerification }
  | { kind: "would_rank"; rank: number }
  | { kind: "low_accuracy" }
  | { kind: "unranked" }
  | { kind: "unavailable"; canSave: boolean };

/** A row of a ranking's top. */
export interface TopEntry {
  rank: number;
  nick: string;
  country: string | null;
  wpm: number;
  accuracy: number;
}

/** `GET /api/leaderboard/me`: the player's position in a ranking, or `null` if they have no record. */
export type MyPositionResponse = { rank: number; wpm: number; accuracy: number } | { rank: null };
