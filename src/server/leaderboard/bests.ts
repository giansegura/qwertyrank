import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { bests } from "../db/schema";
import { encodeScore } from "./score";
import type { Board } from "./store";

export interface BestEntry {
  userId: string;
  gameId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
  /** Hora de la partida: decide el desempate. */
  achievedAt: Date;
}

/**
 * Guarda la partida como mejor marca del jugador en su idioma y teclado, pero solo si supera a la
 * anterior (spec §5.5). A igualdad de PPM y precisión gana la que llegó antes: lo decide `score`.
 * Devuelve si ha entrado (mejora o primera marca); entonces su puntuación es la de la partida.
 */
export async function recordBest(db: DbExecutor, entry: BestEntry): Promise<boolean> {
  const rows = await db
    .insert(bests)
    .values({
      userId: entry.userId,
      language: entry.language,
      inputType: entry.inputType,
      gameId: entry.gameId,
      wpm: entry.wpm,
      accuracy: entry.accuracy,
      score: encodeScore(entry),
      achievedAt: entry.achievedAt,
    })
    .onConflictDoUpdate({
      target: [bests.userId, bests.language, bests.inputType],
      set: {
        gameId: sql`excluded.game_id`,
        wpm: sql`excluded.wpm`,
        accuracy: sql`excluded.accuracy`,
        score: sql`excluded.score`,
        achievedAt: sql`excluded.achieved_at`,
      },
      setWhere: sql`excluded.score > ${bests.score}`,
    })
    .returning({ userId: bests.userId });
  return rows.length > 0;
}

/** Las filas de `bests` de un ranking: idioma y teclado. */
export function isBoard(board: Board): SQL {
  return and(eq(bests.language, board.language), eq(bests.inputType, board.inputType))!;
}

/** Rankings en los que tiene marca un jugador (todas sus `bests`, hasta 6), para sacarle de Redis. */
export async function userBoards(db: DbExecutor, userId: string): Promise<Board[]> {
  return db.select({ language: bests.language, inputType: bests.inputType }).from(bests).where(eq(bests.userId, userId));
}
