import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PublicProfile } from "@/lib/profile";
import type { Db } from "../db/client";
import { bests, games, users } from "../db/schema";

export type { ProfileGame, ProfileRecord, PublicProfile } from "@/lib/profile";

/** Recent games the profile shows. */
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
      // Verification games are not shown (spec 4b §5.3).
      .where(and(eq(games.userId, user.id), eq(games.verdict, "valid"), eq(games.mode, "ranked")))
      .orderBy(desc(games.startsAt))
      .limit(PROFILE_HISTORY_SIZE),
  ]);

  return { nick: user.nick, country: user.country, memberSince: user.createdAt, records, history };
}

/**
 * Public profile (spec §3.6): all-time records per language and keyboard, and history of valid
 * games. Shadow-banned or banned players have no profile for everyone else (spec §4.7).
 */
export function getPublicProfile(db: Db, nick: string): Promise<PublicProfile | null> {
  return loadProfile(db, and(sql`lower(${users.nick}) = lower(${nick})`, eq(users.status, "active"))!);
}

/** The player's own profile, whatever their status: with a shadow ban or ban they still see it (spec 4a §6.2). */
export function getOwnProfile(db: Db, userId: string): Promise<PublicProfile | null> {
  return loadProfile(db, eq(users.id, userId));
}
