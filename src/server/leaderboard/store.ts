import "server-only";
import type { Redis } from "@upstash/redis";
import type { InputType } from "@/lib/game/types";
import { periodKey, periodStart, type Period } from "@/lib/leaderboard/periods";
import type { TestLanguage } from "@/lib/words/languages";

/** Un ranking: idioma × teclado × periodo concreto (spec §5.1). */
export interface Board {
  language: TestLanguage;
  inputType: InputType;
  period: Period;
  key: string;
}

/** El ranking en curso de esa combinación: el del periodo que contiene `at`. */
export function currentBoard(language: TestLanguage, inputType: InputType, period: Period, at = new Date()): Board {
  return { language, inputType, period, key: periodKey(period, at) };
}

export interface BoardScore {
  board: Board;
  userId: string;
  score: number;
  /** Hora de la partida: de ella sale la caducidad del ranking de día y de semana. */
  achievedAt: Date;
}

export interface LeaderboardStore {
  add(entries: BoardScore[]): Promise<void>;
  /** Posición del jugador (1 = el mejor), o `null` si no está. */
  position(board: Board, userId: string): Promise<number | null>;
  /** Posición que tendría esa puntuación, sin escribirla (spec §5.6: "Entrarías el #N"). */
  positionFor(board: Board, score: number): Promise<number>;
  remove(userId: string, boards: Board[]): Promise<void>;
}

const DAY_SECONDS = 86_400;
/** Spec §5.4: los de día caducan a los 8 días y los de semana a las 6 semanas; mes, año y siempre, nunca. */
const TTL_DAYS: Partial<Record<Period, number>> = { day: 8, week: 42 };

export function boardKey(prefix: string, board: Board): string {
  return `${prefix}lb:${board.language}:${board.inputType}:${board.period}:${board.key}`;
}

export function createLeaderboardStore(redis: Redis, prefix: string): LeaderboardStore {
  const key = (board: Board) => boardKey(prefix, board);

  return {
    async add(entries) {
      if (entries.length === 0) return;
      const pipeline = redis.pipeline();
      for (const { board, userId, score, achievedAt } of entries) {
        // GT: la puntuación solo sube; un jugador nuevo se añade igualmente.
        pipeline.zadd(key(board), { gt: true }, { score, member: userId });
        const days = TTL_DAYS[board.period];
        const start = periodStart(board.period, achievedAt);
        if (days && start) pipeline.expireat(key(board), Math.floor(start.getTime() / 1000) + days * DAY_SECONDS);
      }
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
