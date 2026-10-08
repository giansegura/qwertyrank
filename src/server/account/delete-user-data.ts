import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import { userBoards } from "../leaderboard/bests";
import type { LeaderboardStore } from "../leaderboard/store";

/**
 * Al borrar una cuenta (spec §6):
 * - el jugador sale de todos los rankings de Redis y los demás suben (sus `bests` caen en cascada
 *   al borrar la fila de `users`);
 * - se borran las pulsaciones de sus partidas y las partidas se anonimizan: sin usuario, sin
 *   `anon_id` y sin hash de IP. Las PPM se quedan para estadísticas.
 * Sesiones, cuentas y passkeys también caen en cascada.
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
