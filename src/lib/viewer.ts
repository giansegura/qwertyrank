import type { PendingVerification } from "./verification";

/** Evento para volver a pedir la sesión, p. ej. tras cambiar el nick. */
export const SESSION_CHANGED_EVENT = "qr:session-changed";

/**
 * Evento para volver a pedir los récords pendientes de verificar: un récord ha quedado en `review`, o una
 * verificación se ha superado, ha fallado o ya no existe. Lo escucha el aviso del menú de usuario.
 */
export const VERIFICATION_CHANGED_EVENT = "qr:verification-changed";

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

/**
 * Récords del jugador pendientes de verificar (`GET /api/verification`, spec 4b §4.3), para el aviso de
 * la cabecera. Ante cualquier fallo (sin sesión porque se cerró en otra pestaña, servidor caído, red),
 * ninguno: el aviso no sale. Aquí y no en un módulo propio: cada módulo de la portada suma bytes. Por lo
 * mismo, cada pendiente no se valida aquí sino en el aviso, que se descarga aparte.
 */
export async function fetchPendingVerifications(): Promise<PendingVerification[]> {
  try {
    const response = await fetch("/api/verification", { cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as { pending?: unknown } | null;
    return Array.isArray(data?.pending) ? (data.pending as PendingVerification[]) : [];
  } catch {
    return [];
  }
}
