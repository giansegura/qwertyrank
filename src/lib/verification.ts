import type { InputType } from "./game/types";
import type { GameRanking } from "./leaderboard/types";
import type { TestLanguage } from "./words/languages";

/** Modo de una partida (spec 4b §1): Ranked o de verificación de un récord. */
export const GAME_MODES = ["ranked", "verification"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Estado de una verificación (spec 4b §5.1). Una `pending` con `expires_at` pasado está caducada (§3.4). */
export const VERIFICATION_STATUSES = ["pending", "verified", "failed"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Spec 4b §1: hasta 3 intentos en las 24 h siguientes al récord. */
export const VERIFICATION_ATTEMPTS = 3;
export const VERIFICATION_HOURS = 24;
/** Precisión mínima de la partida de verificación: la misma que pide el ranking (spec §3.3). */
export const VERIFICATION_MIN_ACCURACY = 90;

/**
 * PPM que necesita la partida de verificación (spec 4b §2.4): el 85 % de las del récord, redondeado
 * hacia arriba a una décima. Se calcula en centésimas enteras: 72,4 × 0,85 da 61,540000000000006.
 */
export function requiredWpm(targetWpm: number): number {
  return Math.ceil((Math.round(targetWpm * 100) * 85) / 1000) / 10;
}

/**
 * Horas que faltan hasta `expiresAt` (ISO), hacia arriba: "quedan 1 h" hasta el último minuto. Nunca más
 * de 24: el plazo lo pone el reloj de PostgreSQL, que puede ir unos milisegundos por delante del navegador.
 */
export function hoursLeft(expiresAt: string, now: number): number {
  return Math.min(VERIFICATION_HOURS, Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 3_600_000)));
}

/** Una verificación pendiente, como la ven el resultado, el aviso y `/verify` (spec 4b §2.4). */
export interface PendingVerification {
  id: string;
  language: TestLanguage;
  inputType: InputType;
  /** PPM de la partida con más PPM de las que esperan esta verificación. */
  targetWpm: number;
  requiredWpm: number;
  attemptsLeft: number;
  /** ISO 8601. */
  expiresAt: string;
}

/** Resultado de una partida de verificación (spec 4b §3.3). `attemptsLeft: 0`: se acabó. */
export type VerificationOutcome =
  | { kind: "verified"; ranking: GameRanking }
  | { kind: "failed"; requiredWpm: number; attemptsLeft: number };
