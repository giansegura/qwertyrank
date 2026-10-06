import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { TopEntry } from "@/lib/leaderboard/types";
import type { Db } from "../db/client";
import { periodBests, users } from "../db/schema";
import { isBoard } from "./bests";
import { TOP_SIZE } from "./ranking";
import type { Board } from "./store";

/**
 * El top de un ranking, desde PostgreSQL y no desde Redis: así la página se puede regenerar cada
 * 60 s (el cliente de Upstash usa `fetch` sin caché y la haría dinámica). Lo ordena la misma
 * puntuación que Redis, y los jugadores con `status ≠ active` no aparecen (spec §4.7, §5.6).
 */
export async function getTop(db: Db, board: Board, limit = TOP_SIZE): Promise<TopEntry[]> {
  const rows = await db
    .select({
      nick: users.nick,
      country: users.country,
      wpm: periodBests.wpm,
      accuracy: periodBests.accuracy,
    })
    .from(periodBests)
    .innerJoin(users, eq(users.id, periodBests.userId))
    .where(and(isBoard(board), eq(users.status, "active")))
    .orderBy(desc(periodBests.score))
    .limit(limit);
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}
