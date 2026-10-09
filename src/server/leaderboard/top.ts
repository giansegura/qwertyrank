import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { TopEntry } from "@/lib/leaderboard/types";
import type { Db } from "../db/client";
import { bests, users } from "../db/schema";
import { isBoard } from "./bests";
import { TOP_SIZE } from "./ranking";
import type { Board } from "./store";

/**
 * The top of a ranking, from PostgreSQL and not from Redis: that way the page can be regenerated every
 * 60 s (the Upstash client uses uncached `fetch` and would make it dynamic). It is ordered by the same
 * score as Redis, and players with `status ≠ active` don't appear (spec §4.7, §5.6).
 */
export async function getTop(db: Db, board: Board, limit = TOP_SIZE): Promise<TopEntry[]> {
  const rows = await db
    .select({
      nick: users.nick,
      country: users.country,
      wpm: bests.wpm,
      accuracy: bests.accuracy,
    })
    .from(bests)
    .innerJoin(users, eq(users.id, bests.userId))
    .where(and(isBoard(board), eq(users.status, "active")))
    .orderBy(desc(bests.score))
    .limit(limit);
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}
