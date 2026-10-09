import type { ClaimResponse, FinishRequest, FinishResponse, KeysRequest, StartRequest, StartResponse } from "@/lib/game/types";

/** HTTP error from the games API, with the code the server returns (`busy`, `closed`…). */
export class GameApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Seconds remaining, on `rate_limited` (spec 4a §2). */
    readonly retryAfter: number | null = null,
  ) {
    super(`${status} ${code}`);
  }
}

/** A request that does not respond within this time is aborted; the error is retryable. */
export const REQUEST_TIMEOUT_MS = 5_000;

async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: unknown };
      const retryAfter = typeof data.retryAfter === "number" ? data.retryAfter : null;
      throw new GameApiError(response.status, data.error ?? "unknown", retryAfter);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function startGame(body: StartRequest): Promise<StartResponse> {
  return post("/api/game/start", body);
}

export async function sendKeys(gameId: string, body: KeysRequest): Promise<void> {
  await post(`/api/game/${gameId}/keys`, body);
}

/** Network failures, 5xx and the `busy` of a finish already being processed are retried. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof GameApiError)) return true;
  return error.status >= 500 || error.code === "busy";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `T`: `FinishResponse` in Ranked, `VerificationFinishResponse` in a verification game. */
export async function finishGame<T = FinishResponse>(
  gameId: string,
  body: FinishRequest,
  { attempts = 5, delayMs = 400 } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await post<T>(`/api/game/${gameId}/finish`, body);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      await wait(delayMs);
    }
  }
}

export function claimGame(gameId: string): Promise<ClaimResponse> {
  return post(`/api/game/${gameId}/claim`, {});
}
