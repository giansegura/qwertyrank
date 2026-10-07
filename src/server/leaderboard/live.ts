import "server-only";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import type { Period } from "@/lib/leaderboard/periods";
import type { Db } from "../db/client";
import { periodBests, users } from "../db/schema";
import { boardExpiresAt, type BoardScore } from "./store";

const DAY_MS = 86_400_000;
/** Ningún ranking de día o semana vive más de 6 semanas desde su inicio: lo anterior ni se lee. */
const LONGEST_LIFE_MS = 43 * DAY_MS;

/** ¿Sigue existiendo en Redis el ranking de ese periodo? (spec §5.4) */
export function isLiveBoard(period: Period, achievedAt: Date, now: Date): boolean {
  const expiresAt = boardExpiresAt(period, achievedAt);
  return expiresAt === null || expiresAt * 1000 > now.getTime();
}

/**
 * Marcas de jugadores activos en los rankings que siguen vivos (spec 4a §6.1), listas para `store.add`.
 * Las usan "restaurar" (un jugador) y `redis:rebuild` (todos).
 */
export async function liveBests(db: Db, now: Date, userId?: string): Promise<BoardScore[]> {
  const rows = await db
    .select({
      userId: periodBests.userId,
      language: periodBests.language,
      inputType: periodBests.inputType,
      period: periodBests.periodType,
      key: periodBests.periodKey,
      score: periodBests.score,
      achievedAt: periodBests.achievedAt,
    })
    .from(periodBests)
    .innerJoin(users, eq(users.id, periodBests.userId))
    .where(
      and(
        eq(users.status, "active"),
        userId ? eq(periodBests.userId, userId) : undefined,
        or(
          inArray(periodBests.periodType, ["month", "year", "all"]),
          gt(periodBests.achievedAt, new Date(now.getTime() - LONGEST_LIFE_MS)),
        ),
      ),
    );
  return rows
    .filter((row) => isLiveBoard(row.period, row.achievedAt, now))
    .map((row) => ({
      board: { language: row.language, inputType: row.inputType, period: row.period, key: row.key },
      userId: row.userId,
      score: row.score,
      achievedAt: row.achievedAt,
    }));
}
