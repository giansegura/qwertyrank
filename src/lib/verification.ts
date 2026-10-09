import type { InputType } from "./game/types";
import type { GameRanking } from "./leaderboard/types";
import type { TestLanguage } from "./words/languages";

/** Mode of a game (spec 4b §1): Ranked or verification of a record. */
export const GAME_MODES = ["ranked", "verification"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Status of a verification (spec 4b §5.1). A `pending` one with a past `expires_at` is expired (§3.4). */
export const VERIFICATION_STATUSES = ["pending", "verified", "failed"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Spec 4b §1: up to 3 attempts in the 24 h after the record. */
export const VERIFICATION_ATTEMPTS = 3;
export const VERIFICATION_HOURS = 24;
/** Minimum accuracy of the verification game: the same the ranking requires (spec §3.3). */
export const VERIFICATION_MIN_ACCURACY = 90;

/**
 * WPM the verification game needs (spec 4b §2.4): 85 % of the record's, rounded up to one decimal.
 * It is computed in integer hundredths: 72.4 × 0.85 gives 61.540000000000006.
 */
export function requiredWpm(targetWpm: number): number {
  return Math.ceil((Math.round(targetWpm * 100) * 85) / 1000) / 10;
}

/**
 * Hours left until `expiresAt` (ISO), rounded up: "1 h left" until the last minute. Never more than
 * 24: the deadline is set by the PostgreSQL clock, which may be a few milliseconds ahead of the browser.
 */
export function hoursLeft(expiresAt: string, now: number): number {
  return Math.min(VERIFICATION_HOURS, Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 3_600_000)));
}

/** A pending verification, as seen by the result, the notice and `/verify` (spec 4b §2.4). */
export interface PendingVerification {
  id: string;
  language: TestLanguage;
  inputType: InputType;
  /** WPM of the game with the most WPM among those awaiting this verification. */
  targetWpm: number;
  requiredWpm: number;
  attemptsLeft: number;
  /** ISO 8601. */
  expiresAt: string;
}

/** Outcome of a verification game (spec 4b §3.3). `attemptsLeft: 0`: it is over. */
export type VerificationOutcome =
  | { kind: "verified"; ranking: GameRanking }
  | { kind: "failed"; requiredWpm: number; attemptsLeft: number };
