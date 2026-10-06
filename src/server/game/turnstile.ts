import "server-only";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const SITEVERIFY_TIMEOUT_MS = 3_000;

/** Cloudflare no ha respondido (red, 5xx o tiempo agotado): `start` responde 503, no `needs_challenge`. */
export class TurnstileUnavailableError extends Error {}

export type VerifyTurnstile = (token: string, ip: string | null) => Promise<boolean>;

/**
 * Verifica el token del reto (spec 4a §2). Solo cuenta `success`: con las claves de prueba de
 * Cloudflare la acción es "test", y con un único widget comprobarla no añade nada.
 */
export function createTurnstileVerifier(secret: string, fetchImpl: typeof fetch = fetch): VerifyTurnstile {
  return async (token, ip) => {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    let response: Response;
    try {
      response = await fetchImpl(SITEVERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      });
    } catch (error) {
      throw new TurnstileUnavailableError("siteverify unreachable", { cause: error });
    }
    if (!response.ok) throw new TurnstileUnavailableError(`siteverify responded ${response.status}`);
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  };
}
