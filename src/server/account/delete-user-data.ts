import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";

/**
 * Al borrar una cuenta (spec §6) se borran las pulsaciones de sus partidas y las partidas se
 * anonimizan: sin usuario, sin `anon_id` y sin hash de IP. Las PPM se quedan para estadísticas.
 * Sesiones, cuentas y passkeys caen en cascada al borrar la fila de `users`.
 */
export function createDeleteUserData(db: Db) {
  return async (userId: string): Promise<void> => {
    await db.transaction(async (tx) => {
      const owned = tx.select({ id: games.id }).from(games).where(eq(games.userId, userId));
      await tx.delete(keystrokeLogs).where(inArray(keystrokeLogs.gameId, owned));
      await tx.update(games).set({ userId: null, anonId: null, ipHash: null }).where(eq(games.userId, userId));
    });
  };
}
