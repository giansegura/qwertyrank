import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import { PERIODS, periodKeys, type Period } from "@/lib/leaderboard/periods";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { periodBests } from "../db/schema";
import { encodeScore } from "./score";
import type { Board } from "./store";

export interface BestEntry {
  userId: string;
  gameId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
  /** Hora de la partida: decide sus periodos y el desempate. */
  achievedAt: Date;
}

export interface ImprovedBest {
  period: Period;
  key: string;
  score: number;
}

/**
 * Guarda la partida como mejor marca de los 5 periodos en que se jugó, pero solo donde supera a
 * la anterior (spec §5.5). A igualdad de PPM y precisión gana la que llegó antes: lo decide `score`.
 * Devuelve los periodos donde ha entrado (mejora o primera marca).
 */
export async function recordBests(db: DbExecutor, entry: BestEntry): Promise<ImprovedBest[]> {
  const score = encodeScore(entry);
  const keys = periodKeys(entry.achievedAt);
  return db
    .insert(periodBests)
    .values(
      PERIODS.map((period) => ({
        userId: entry.userId,
        language: entry.language,
        inputType: entry.inputType,
        periodType: period,
        periodKey: keys[period],
        gameId: entry.gameId,
        wpm: entry.wpm,
        accuracy: entry.accuracy,
        score,
        achievedAt: entry.achievedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [periodBests.userId, periodBests.language, periodBests.inputType, periodBests.periodType, periodBests.periodKey],
      set: {
        gameId: sql`excluded.game_id`,
        wpm: sql`excluded.wpm`,
        accuracy: sql`excluded.accuracy`,
        score: sql`excluded.score`,
        achievedAt: sql`excluded.achieved_at`,
      },
      setWhere: sql`excluded.score > ${periodBests.score}`,
    })
    .returning({ period: periodBests.periodType, key: periodBests.periodKey, score: periodBests.score });
}

/** Las filas de `period_bests` de un ranking: idioma, teclado, periodo y clave. */
export function isBoard(board: Board): SQL {
  return and(
    eq(periodBests.language, board.language),
    eq(periodBests.inputType, board.inputType),
    eq(periodBests.periodType, board.period),
    eq(periodBests.periodKey, board.key),
  )!;
}
