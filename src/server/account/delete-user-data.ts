import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import { userBoards } from "../leaderboard/bests";
import type { LeaderboardStore } from "../leaderboard/store";

/**
 * When an account is deleted (spec §6):
 * - the player leaves every Redis ranking and everyone else moves up (their `bests` cascade
 *   when the `users` row is deleted);
 * - the keystrokes of their games are deleted and the games are anonymized: no user, no
 *   `anon_id` and no IP hash. The wpm stay for statistics.
 * Sessions, accounts and passkeys cascade too.
 */
export function createDeleteUserData(db: Db, store: LeaderboardStore) {
  return async (userId: string): Promise<void> => {
    const boards = await userBoards(db, userId);
    await store.remove(userId, boards);

    await db.transaction(async (tx) => {
      const owned = tx.select({ id: games.id }).from(games).where(eq(games.userId, userId));
      await tx.delete(keystrokeLogs).where(inArray(keystrokeLogs.gameId, owned));
      await tx.update(games).set({ userId: null, anonId: null, ipHash: null }).where(eq(games.userId, userId));
    });
  };
}
