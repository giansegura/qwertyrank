import "server-only";
import { and, eq } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import type { GameRanking, MyPositionResponse } from "@/lib/leaderboard/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { bests, users } from "../db/schema";
import { isBoard } from "./bests";
import { RANKED_MIN_ACCURACY, encodeScore } from "./score";
import type { Board, LeaderboardStore } from "./store";

/** Each ranking shows its top 100 (spec §5.6). */
export const TOP_SIZE = 100;

export interface RankGameInput {
  userId: string | null;
  language: TestLanguage;
  inputType: InputType;
  verdict: Verdict;
  wpm: number;
  accuracy: number;
  startsAt: Date;
  /** Whether the game improved the player's best (from `recordBest`). */
  improved: boolean;
}

export interface RankingDeps {
  db: Db;
  store: LeaderboardStore;
  /** In production, `revalidatePath` of the page of each ranking that changes. */
  onTopChanged: (changes: Board[]) => void;
}

export function createRanking(deps: RankingDeps) {
  async function isActive(userId: string): Promise<boolean> {
    const [row] = await deps.db.select({ status: users.status }).from(users).where(eq(users.id, userId));
    return row?.status === "active";
  }

  /** Score of the player's best in that ranking, from PostgreSQL (by primary key), or `null`. */
  async function bestScore(userId: string, board: Board): Promise<number | null> {
    const [row] = await deps.db
      .select({ score: bests.score })
      .from(bests)
      .where(and(eq(bests.userId, userId), isBoard(board)));
    return row?.score ?? null;
  }

  async function computeRanking(game: RankGameInput): Promise<GameRanking> {
    if (game.verdict !== "valid") return { kind: "unranked" };
    if (game.accuracy < RANKED_MIN_ACCURACY) return { kind: "low_accuracy" };

    const board: Board = { language: game.language, inputType: game.inputType };
    const score = encodeScore({ wpm: game.wpm, accuracy: game.accuracy, achievedAt: game.startsAt });

    if (!game.userId) {
      // No account: the position it would have, without writing to the ranking.
      return { kind: "would_rank", rank: await deps.store.positionFor(board, score) };
    }

    const userId = game.userId;
    if (!(await isActive(userId))) {
      // Shadow ban (spec §4.7): sees a position "as if they were there", but nobody else sees it.
      const rank = await deps.store.positionFor(board, (await bestScore(userId, board)) ?? score);
      return { kind: "ranked", rank, improved: game.improved };
    }

    // Only if their best improved. If Redis is missing the player (it lost data or a write
    // failed), it is repaired with their best from PostgreSQL, the source of truth (spec §5.2).
    if (game.improved) await deps.store.add([{ board, userId, score }]);
    let listed = await deps.store.position(board, userId);
    if (listed === null) {
      const best = await bestScore(userId, board);
      if (best !== null) await deps.store.add([{ board, userId, score: best }]);
      listed = await deps.store.position(board, userId);
    }
    // If they were sanctioned or deleted the account meanwhile, the write is undone (spec 4a §3.5):
    // if the sanction came before this read, the game cleans up; if it comes after, the sanction does.
    if (!(await isActive(userId))) await deps.store.remove(userId, [board]);
    const rank = listed ?? (await deps.store.positionFor(board, score));
    if (game.improved && rank <= TOP_SIZE) {
      try {
        deps.onTopChanged([board]);
      } catch (error) {
        // The page is regenerated after 60 s anyway: no reason to lose the already computed position.
        console.error("leaderboard revalidation failed", error);
      }
    }
    return { kind: "ranked", rank, improved: game.improved };
  }

  /**
   * Publishes the best the game improved and computes its position in the ranking of its language and
   * keyboard (spec §5.5–5.6). Does not throw: the game is already saved, and if Redis fails it responds
   * without a position (`unavailable`).
   */
  async function rankGame(game: RankGameInput): Promise<GameRanking> {
    try {
      return await computeRanking(game);
    } catch (error) {
      console.error("ranking failed", error);
      return { kind: "unavailable", canSave: game.userId === null };
    }
  }

  /** The player's position in a ranking and their best (`GET /api/leaderboard/me`). */
  async function myPosition(userId: string, board: Board): Promise<MyPositionResponse> {
    const [best] = await deps.db
      .select({ wpm: bests.wpm, accuracy: bests.accuracy, score: bests.score, status: users.status })
      .from(bests)
      .innerJoin(users, eq(users.id, bests.userId))
      .where(and(eq(bests.userId, userId), isBoard(board)));
    if (!best) return { rank: null };
    // In shadow ban they are not in Redis: their position "as if they were there" (spec §4.7).
    const listed = best.status === "active" ? await deps.store.position(board, userId) : null;
    return { rank: listed ?? (await deps.store.positionFor(board, best.score)), wpm: best.wpm, accuracy: best.accuracy };
  }

  return { rankGame, myPosition };
}

export type Ranking = ReturnType<typeof createRanking>;
