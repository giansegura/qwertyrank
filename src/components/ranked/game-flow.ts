import type { PublicReason, StartRequest, StartResponse } from "@/lib/game/types";
import { GameApiError, finishGame, startGame } from "./api";
import type { BatchSender } from "./batch-sender";

/** El reto no se pudo resolver: el script no cargó, el widget dio error o se agotó el tiempo. */
export class ChallengeFailedError extends Error {}

/**
 * Pide la partida; si el servidor exige el reto (spec 4a §2.1), lo resuelve en el contenedor y la pide
 * otra vez, una sola vez. `onChallenge` avisa de que empieza el reto. Lo comparten Ranked y la
 * verificación (spec 4b §4.2).
 */
export async function requestStart(
  body: StartRequest,
  challenge: { container: () => HTMLElement | null; onChallenge: () => void },
): Promise<StartResponse> {
  try {
    return await startGame(body);
  } catch (error) {
    if (!(error instanceof GameApiError) || error.code !== "needs_challenge") throw error;
  }
  challenge.onChallenge();
  let turnstileToken: string;
  try {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const container = challenge.container();
    if (!siteKey || !container) throw new Error("turnstile not configured");
    const { solveChallenge } = await import("./challenge");
    turnstileToken = await solveChallenge(container, siteKey);
  } catch (error) {
    throw new ChallengeFailedError(undefined, { cause: error });
  }
  return startGame({ ...body, turnstileToken });
}

export type BlockReason = "challenge_failed" | "banned" | "rate_limited";

export const BLOCK_MESSAGE: Record<BlockReason, "challengeFailed" | "banned" | "rateLimited"> = {
  challenge_failed: "challengeFailed",
  banned: "banned",
  rate_limited: "rateLimited",
};

export type StartFailure =
  | { kind: "blocked"; reason: BlockReason; minutes: number }
  | { kind: "no_pending" }
  | { kind: "unavailable" };

/** Por qué no ha empezado la partida (spec 4a §2.1; spec 4b §4.2; spec §8.4). */
export function startFailure(error: unknown): StartFailure {
  if (error instanceof ChallengeFailedError) return { kind: "blocked", reason: "challenge_failed", minutes: 0 };
  if (!(error instanceof GameApiError)) return { kind: "unavailable" };
  // Un segundo `needs_challenge` es un token rechazado: no se reintenta en bucle.
  if (error.code === "needs_challenge") return { kind: "blocked", reason: "challenge_failed", minutes: 0 };
  if (error.code === "banned") return { kind: "blocked", reason: "banned", minutes: 0 };
  if (error.code === "rate_limited") {
    return { kind: "blocked", reason: "rate_limited", minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) };
  }
  if (error.code === "no_pending_verification") return { kind: "no_pending" };
  return { kind: "unavailable" };
}

/** El texto (en `Ranked`) de cada motivo por el que el servidor no cuenta una partida (spec §4.9). */
export const REASON_MESSAGE: Record<PublicReason, "verdictConnection" | "verdictUnrecognized" | "verdictLetterByLetter"> = {
  connection: "verdictConnection",
  unrecognized: "verdictUnrecognized",
  letter_by_letter: "verdictLetterByLetter",
};

/** Si el servidor no confirma la partida en este tiempo, se enseña el resultado local (spec §8.4). */
export const SUBMIT_DEADLINE_MS = 10_000;

export type Confirmation<T> = { kind: "result"; response: T } | { kind: "replaced" | "failed" | "timeout" };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Envía lo pendiente y pide el veredicto al servidor, sin esperar más de `SUBMIT_DEADLINE_MS`. */
export function confirmFinish<T>(gameId: string, sender: BatchSender): Promise<Confirmation<T>> {
  const confirm = async (): Promise<Confirmation<T>> => {
    const { lastSeq } = await sender.flush();
    try {
      return { kind: "result", response: await finishGame<T>(gameId, { lastSeq }) };
    } catch (error) {
      return { kind: error instanceof GameApiError && error.code === "closed" ? "replaced" : "failed" };
    }
  };
  return Promise.race([confirm(), wait(SUBMIT_DEADLINE_MS).then((): Confirmation<T> => ({ kind: "timeout" }))]);
}
