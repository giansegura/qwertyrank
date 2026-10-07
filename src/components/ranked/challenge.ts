/**
 * Reto de Cloudflare Turnstile (spec 4a §2.1). `RankedTest` lo descarga con `import()` solo cuando
 * `start` responde `needs_challenge`: ni este código ni el script de Cloudflare pesan en la portada.
 */
export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const CHALLENGE_TIMEOUT_MS = 15_000;

interface TurnstileOptions {
  sitekey: string;
  action: string;
  appearance: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "error-callback": () => void;
}

interface Turnstile {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.append(script);
  }).catch((error: unknown) => {
    // El siguiente intento vuelve a pedir el script.
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * Resuelve el reto en `container` (invisible salvo que Cloudflare pida un clic) y devuelve el token.
 * Falla si el script no carga, si el widget da error o si en `timeoutMs` no hay token.
 */
export function solveChallenge(container: HTMLElement, siteKey: string, timeoutMs = CHALLENGE_TIMEOUT_MS): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let widget: { turnstile: Turnstile; id: string } | null = null;
    let settled = false;
    const settle = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (widget) widget.turnstile.remove(widget.id);
      done();
    };
    const timer = setTimeout(() => settle(() => reject(new Error("turnstile timeout"))), timeoutMs);
    loadTurnstile().then(
      (turnstile) => {
        if (settled) return;
        const id = turnstile.render(container, {
          sitekey: siteKey,
          action: "ranked-start",
          appearance: "interaction-only",
          callback: (token) => settle(() => resolve(token)),
          "error-callback": () => settle(() => reject(new Error("turnstile error"))),
        });
        if (id) widget = { turnstile, id };
      },
      (error: unknown) => settle(() => reject(error)),
    );
  });
}
