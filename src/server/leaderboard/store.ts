import "server-only";
import type { Redis } from "@upstash/redis";
import type { InputType } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";

/** A ranking: language × keyboard (spec §5.1). It counts each player's all-time best. */
export interface Board {
  language: TestLanguage;
  inputType: InputType;
}

export interface BoardScore {
  board: Board;
  userId: string;
  score: number;
}

export interface LeaderboardStore {
  add(entries: BoardScore[]): Promise<void>;
  /** The player's position (1 = the best), or `null` if they are not there. */
  position(board: Board, userId: string): Promise<number | null>;
  /** Position that score would have, without writing it (spec §5.6: "You would enter at #N"). */
  positionFor(board: Board, score: number): Promise<number>;
  remove(userId: string, boards: Board[]): Promise<void>;
}

/** One sorted set per ranking, without expiry (spec §5.4): `lb:es:physical`. */
export function boardKey(prefix: string, board: Board): string {
  return `${prefix}lb:${board.language}:${board.inputType}`;
}

export function createLeaderboardStore(redis: Redis, prefix: string): LeaderboardStore {
  const key = (board: Board) => boardKey(prefix, board);

  return {
    async add(entries) {
      if (entries.length === 0) return;
      const pipeline = redis.pipeline();
      // GT: the score only goes up; a new player is added anyway.
      for (const { board, userId, score } of entries) pipeline.zadd(key(board), { gt: true }, { score, member: userId });
      await pipeline.exec();
    },

    async position(board, userId) {
      const rank = await redis.zrevrank(key(board), userId);
      return rank === null ? null : Number(rank) + 1;
    },

    async positionFor(board, score) {
      return Number(await redis.zcount(key(board), `(${score}`, "+inf")) + 1;
    },

    async remove(userId, boards) {
      if (boards.length === 0) return;
      const pipeline = redis.pipeline();
      for (const board of boards) pipeline.zrem(key(board), userId);
      await pipeline.exec();
    },
  };
}
