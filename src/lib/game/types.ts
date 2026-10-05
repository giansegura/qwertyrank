import type { TestResult } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
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
}
