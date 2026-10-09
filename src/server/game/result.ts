import "server-only";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { type GameResult, isGameId } from "@/lib/game/result";
import type { Db } from "../db/client";
import { games, users } from "../db/schema";

async function loadResult(db: Db, id: string, where: SQL | undefined): Promise<GameResult | null> {
  if (!isGameId(id)) return null;
  const [row] = await db
    .select({
      id: games.id,
      language: games.language,
      inputType: games.inputType,
      wpm: games.wpm,
      accuracy: games.accuracy,
      startsAt: games.startsAt,
      nick: users.nick,
      country: users.country,
    })
    .from(games)
    .leftJoin(users, eq(users.id, games.userId))
    // Solo Ranked y válidas: las de verificación no se enseñan (spec 4b §5.3).
    .where(and(eq(games.id, id), eq(games.mode, "ranked"), eq(games.verdict, "valid"), where));
  if (!row) return null;
  const { nick, country, ...game } = row;
  return { ...game, player: nick === null ? null : { nick, country } };
}

/**
 * La partida de una página de resultado (spec 5d §2): Ranked, válida y anónima o de un jugador activo. Con
 * shadow-ban o ban no la ven los demás, como su perfil (spec §4.7).
 */
export function getPublicResult(db: Db, id: string): Promise<GameResult | null> {
  return loadResult(db, id, or(isNull(games.userId), eq(users.status, "active")));
}

/** La partida del propio jugador, sea cual sea su estado: con shadow-ban o ban la sigue viendo (spec 5d §5). */
export function getOwnResult(db: Db, userId: string, id: string): Promise<GameResult | null> {
  return loadResult(db, id, eq(games.userId, userId));
}
