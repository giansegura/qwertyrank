import type { GameRanking } from "@/lib/leaderboard/types";
import type { TestResult } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import type { GameMode } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";

/** Tipos del protocolo de una partida Ranked, compartidos por navegador y servidor. */

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

/** Lo único que ve el jugador del motivo de rechazo: la regla exacta solo se guarda en el servidor (spec §4.9). */
export type PublicReason = "connection" | "unrecognized" | "letter_by_letter";

/** Señales del navegador sobre el dispositivo. Son una declaración: el servidor no se fía solo de ellas. */
export interface ClientEnv {
  coarse: boolean;
  touchPoints: number;
}

export interface StartRequest {
  language: TestLanguage;
  env: ClientEnv;
  /** Solo al repetir `start` tras `needs_challenge` (spec 4a §2.1). */
  turnstileToken?: string;
  /** Por defecto `ranked`. Una partida de verificación necesita sesión y `verificationId` (spec 4b §3.1). */
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
  /** Posiciones en los rankings (spec §3.4, §8.3). */
  ranking: GameRanking;
}

/** `POST /api/game/{id}/claim`: la partida pasa a la cuenta y estas son sus posiciones (spec §3.7). */
export interface ClaimResponse {
  ranking: GameRanking;
  language: TestLanguage;
  inputType: InputType;
}
