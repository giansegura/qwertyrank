import "server-only";
import { and, eq, gt, isNull, or, type SQL, sql } from "drizzle-orm";
import { type GameResult, isGameId } from "@/lib/game/result";
import type { Db } from "../db/client";
import { games, recordVerifications, users } from "../db/schema";

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
    // Only Ranked and valid: verification games are not shown (spec 4b §5.3).
    .where(and(eq(games.id, id), eq(games.mode, "ranked"), eq(games.verdict, "valid"), where));
  if (!row) return null;
  const { nick, country, ...game } = row;
  return { ...game, player: nick === null ? null : { nick, country } };
}

/**
 * The game for a result page (spec 5d §2): Ranked, valid and anonymous or from an active player. Under a
 * shadow ban or ban others do not see it, like their profile (spec §4.7).
 */
export function getPublicResult(db: Db, id: string): Promise<GameResult | null> {
  return loadResult(db, id, or(isNull(games.userId), eq(users.status, "active")));
}

/** The player's own game, whatever their status: under a shadow ban or ban they still see it (spec 5d §5). */
export function getOwnResult(db: Db, userId: string, id: string): Promise<GameResult | null> {
  return loadResult(db, id, eq(games.userId, userId));
}

/**
 * Whether the game is a Ranked one waiting for its player's verification (spec 4b §2): saved or claimed into
 * `review`, with the verification still open. Its link may already be out (shared while anonymous, before the
 * claim), so it says so instead of a 404, without the score or the nick, until the verification publishes it or closes.
 */
export async function isPendingResult(db: Db, id: string): Promise<boolean> {
  if (!isGameId(id)) return false;
  const [row] = await db
    .select({ id: games.id })
    .from(games)
    .innerJoin(users, eq(users.id, games.userId))
    .innerJoin(recordVerifications, eq(recordVerifications.id, games.verificationId))
    .where(
      and(
        eq(games.id, id),
        eq(games.mode, "ranked"),
        eq(games.verdict, "review"),
        eq(users.status, "active"),
        eq(recordVerifications.status, "pending"),
        gt(recordVerifications.expiresAt, sql`now()`),
      ),
    );
  return row !== undefined;
}
