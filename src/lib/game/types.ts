import type { GameRanking } from "@/lib/leaderboard/types";
import type { TestResult } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import type { GameMode, VerificationOutcome } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";

/** Protocol types of a Ranked game, shared by browser and server. */

export type InputType = "physical" | "touch";
export type Verdict = "valid" | "review" | "rejected";

export type RejectReason =
  | "late"
  | "incomplete"
  | "early_input"
  | "fabricated_timing"
  | "untrusted"
  | "injected_input"
  | "multi_insert"
  | "inhuman_burst"
  | "inhuman_speed";

/** All the player sees of the rejection reason: the exact rule is only stored on the server (spec §4.9). */
export type PublicReason = "connection" | "unrecognized" | "letter_by_letter";

/** Browser signals about the device. They are a claim: the server does not trust them alone. */
export interface ClientEnv {
  coarse: boolean;
  touchPoints: number;
}

export interface StartRequest {
  language: TestLanguage;
  env: ClientEnv;
  /** Only when repeating `start` after `needs_challenge` (spec 4a §2.1). */
  turnstileToken?: string;
  /** Defaults to `ranked`. A verification game needs a session and `verificationId` (spec 4b §3.1). */
  mode?: GameMode;
  verificationId?: string;
}

export interface StartResponse {
  gameId: string;
  words: string[];
  countdownMs: number;
  durationMs: number;
}

export interface KeysRequest {
  seq: number;
  events: TypingEvent[];
}

export interface FinishRequest {
  lastSeq: number;
}

export interface FinishResponse extends TestResult {
  gameId: string;
  inputType: InputType;
  verdict: Verdict;
  reason: PublicReason | null;
  /** Position in the ranking (spec §3.4, §8.3). */
  ranking: GameRanking;
}

/** `finish` of a verification game (spec 4b §3.3): instead of `ranking`, its outcome. */
export type VerificationFinishResponse = Omit<FinishResponse, "ranking"> & { verification: VerificationOutcome };

/** `POST /api/game/{id}/claim`: the game moves to the account and this is its position (spec §3.7). */
export interface ClaimResponse {
  ranking: GameRanking;
  language: TestLanguage;
  inputType: InputType;
}
