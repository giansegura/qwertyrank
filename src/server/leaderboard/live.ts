import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { bests, users } from "../db/schema";
import type { BoardScore } from "./store";

/**
 * Bests of the active players (spec 4a §6.1), ready for `store.add`; only those of `userId` if it is
 * given. Used by "restore" (one player) and `redis:rebuild` (everyone).
 */
export async function activeBests(db: Db, userId?: string): Promise<BoardScore[]> {
  const rows = await db
    .select({ userId: bests.userId, language: bests.language, inputType: bests.inputType, score: bests.score })
    .from(bests)
    .innerJoin(users, eq(users.id, bests.userId))
    .where(and(eq(users.status, "active"), userId ? eq(bests.userId, userId) : undefined));
  return rows.map((row) => ({
    board: { language: row.language, inputType: row.inputType },
    userId: row.userId,
    score: row.score,
  }));
}
