import "server-only";
import { getAuth } from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  nick: string;
  country: string | null;
}

/** Usuario con sesión en esta petición, o `null` si no hay. */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const { id, email, nick, country } = session.user;
  return { id, email, nick, country: country ?? null };
}
