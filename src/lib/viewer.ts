import type { PendingVerification } from "./verification";

/** Event to fetch the session again, e.g. after changing the nick. */
export const SESSION_CHANGED_EVENT = "qr:session-changed";

/**
 * Event to fetch the records pending verification again: a record has ended up in `review`, or a
 * verification has passed, failed or no longer exists. The user menu's notice listens to it.
 */
export const VERIFICATION_CHANGED_EVENT = "qr:verification-changed";

export type Viewer = { nick: string } | null;

let pending: Promise<Viewer> | null = null;

/**
 * Who is viewing the page: a single request to `/api/auth/get-session`, shared by the header and
 * the ranking. Without the Better Auth client: on the home page every KB counts (spec §7.5).
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

/** Forgets the already fetched session: the next call asks again. */
export function forgetViewer(): void {
  pending = null;
}

/**
 * The player's records pending verification (`GET /api/verification`, spec 4b §4.3), for the header's
 * notice. On any failure (no session because it was closed in another tab, server down, network),
 * none: the notice does not show. Here and not in its own module: every home page module adds bytes. For
 * the same reason, each pending one is not validated here but in the notice, which is downloaded separately.
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
