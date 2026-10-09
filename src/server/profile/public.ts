import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PublicProfile } from "@/lib/profile";
import type { Db } from "../db/client";
import { bests, games, users } from "../db/schema";

export type { ProfileGame, ProfileRecord, PublicProfile } from "@/lib/profile";

/** Partidas recientes que enseña el perfil. */
export const PROFILE_HISTORY_SIZE = 20;

async function loadProfile(db: Db, where: SQL): Promise<PublicProfile | null> {
  const [user] = await db
    .select({ id: users.id, nick: users.nick, country: users.country, createdAt: users.createdAt })
    .from(users)
    .where(where);
  if (!user) return null;

  const [records, history] = await Promise.all([
    db
      .select({
        gameId: bests.gameId,
        language: bests.language,
        inputType: bests.inputType,
        wpm: bests.wpm,
        accuracy: bests.accuracy,
      })
      .from(bests)
      .where(eq(bests.userId, user.id))
      .orderBy(desc(bests.score)),
    db
      .select({
        id: games.id,
        startsAt: games.startsAt,
        language: games.language,
        inputType: games.inputType,
        wpm: games.wpm,
        accuracy: games.accuracy,
      })
      .from(games)
      // Las partidas de verificación no se enseñan (spec 4b §5.3).
      .where(and(eq(games.userId, user.id), eq(games.verdict, "valid"), eq(games.mode, "ranked")))
      .orderBy(desc(games.startsAt))
      .limit(PROFILE_HISTORY_SIZE),
  ]);

  return { nick: user.nick, country: user.country, memberSince: user.createdAt, records, history };
}

/**
 * Perfil público (spec §3.6): récords de siempre por idioma y teclado, e historial de partidas
 * válidas. Los jugadores en shadow-ban o baneados no tienen perfil para los demás (spec §4.7).
 */
export function getPublicProfile(db: Db, nick: string): Promise<PublicProfile | null> {
  return loadProfile(db, and(sql`lower(${users.nick}) = lower(${nick})`, eq(users.status, "active"))!);
}

/** El perfil del propio jugador, sea cual sea su estado: con shadow-ban o ban lo sigue viendo (spec 4a §6.2). */
export function getOwnProfile(db: Db, userId: string): Promise<PublicProfile | null> {
  return loadProfile(db, eq(users.id, userId));
}
