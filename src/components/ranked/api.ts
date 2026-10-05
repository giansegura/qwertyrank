import type { FinishRequest, FinishResponse, KeysRequest, StartRequest, StartResponse } from "@/lib/game/types";

/** Error HTTP de la API de partidas, con el código que devuelve el servidor (`busy`, `closed`…). */
export class GameApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** Una petición que no responde en este tiempo se corta; el error se puede reintentar. */
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
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new GameApiError(response.status, data.error ?? "unknown");
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

/** Se reintentan los fallos de red, los 5xx y el `busy` de un final que ya se está procesando. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof GameApiError)) return true;
  return error.status >= 500 || error.code === "busy";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function finishGame(
  gameId: string,
  body: FinishRequest,
  { attempts = 5, delayMs = 400 } = {},
): Promise<FinishResponse> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await post<FinishResponse>(`/api/game/${gameId}/finish`, body);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      await wait(delayMs);
    }
  }
}
