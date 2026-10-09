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
  /** Time of the game: breaks ties. */
  achievedAt: Date;
}

/**
 * Stores the game as the player's best in its language and keyboard, but only if it beats the
 * previous one (spec §5.5). On equal wpm and accuracy the earlier one wins: `score` decides it.
 * Returns whether it got in (improvement or first best); in that case its score is the game's.
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

/** The `bests` rows of a ranking: language and keyboard. */
export function isBoard(board: Board): SQL {
  return and(eq(bests.language, board.language), eq(bests.inputType, board.inputType))!;
}

/** Rankings where a player has a best (all their `bests`, up to 6), to remove them from Redis. */
export async function userBoards(db: DbExecutor, userId: string): Promise<Board[]> {
  return db.select({ language: bests.language, inputType: bests.inputType }).from(bests).where(eq(bests.userId, userId));
}
