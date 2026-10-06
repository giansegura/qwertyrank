import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PublicProfile } from "@/lib/profile";
import type { Db } from "../db/client";
import { games, periodBests, users } from "../db/schema";

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
        language: periodBests.language,
        inputType: periodBests.inputType,
        wpm: periodBests.wpm,
        accuracy: periodBests.accuracy,
      })
      .from(periodBests)
      .where(and(eq(periodBests.userId, user.id), eq(periodBests.periodType, "all")))
      .orderBy(desc(periodBests.score)),
    db
      .select({
        startsAt: games.startsAt,
        language: games.language,
        inputType: games.inputType,
        wpm: games.wpm,
        accuracy: games.accuracy,
      })
      .from(games)
      .where(and(eq(games.userId, user.id), eq(games.verdict, "valid")))
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
