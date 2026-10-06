/** Evento para volver a pedir la sesión, p. ej. tras cambiar el nick. */
export const SESSION_CHANGED_EVENT = "qr:session-changed";

export type Viewer = { nick: string } | null;

let pending: Promise<Viewer> | null = null;

/**
 * Quién mira la página: una sola petición a `/api/auth/get-session`, compartida por la cabecera y
 * el ranking. Sin el cliente de Better Auth: en la portada cada KB cuenta (spec §7.5).
 */
export function getViewer(): Promise<Viewer> {
  pending ??= fetch("/api/auth/get-session", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as { user?: { nick?: string } } | null;
      return data?.user?.nick ? { nick: data.user.nick } : null;
    })
    .catch(() => null);
  return pending;
}

/** Olvida la sesión ya pedida: la siguiente llamada vuelve a preguntar. */
export function forgetViewer(): void {
  pending = null;
}
