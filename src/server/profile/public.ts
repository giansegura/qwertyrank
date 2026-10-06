import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { games, periodBests, users } from "../db/schema";

/** Partidas recientes que enseña el perfil. */
export const PROFILE_HISTORY_SIZE = 20;

export interface ProfileRecord {
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
}

export interface ProfileGame {
  startsAt: Date;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
}

export interface PublicProfile {
  nick: string;
  country: string | null;
  memberSince: Date;
  records: ProfileRecord[];
  history: ProfileGame[];
}

/**
 * Perfil público (spec §3.6): récords de siempre por idioma y teclado, e historial de partidas
 * válidas. Los jugadores en shadow-ban o baneados no tienen perfil para los demás (spec §4.7).
 */
export async function getPublicProfile(db: Db, nick: string): Promise<PublicProfile | null> {
  const [user] = await db
    .select({ id: users.id, nick: users.nick, country: users.country, createdAt: users.createdAt })
    .from(users)
    .where(and(sql`lower(${users.nick}) = lower(${nick})`, eq(users.status, "active")));
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
