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

/** Cada ranking enseña su top 100 (spec §5.6). */
export const TOP_SIZE = 100;

export interface RankGameInput {
  userId: string | null;
  language: TestLanguage;
  inputType: InputType;
  verdict: Verdict;
  wpm: number;
  accuracy: number;
  startsAt: Date;
  /** Si la partida ha mejorado la marca del jugador (de `recordBest`). */
  improved: boolean;
}

export interface RankingDeps {
  db: Db;
  store: LeaderboardStore;
  /** En producción, `revalidatePath` de la página de cada ranking que cambia. */
  onTopChanged: (changes: Board[]) => void;
}

export function createRanking(deps: RankingDeps) {
  async function isActive(userId: string): Promise<boolean> {
    const [row] = await deps.db.select({ status: users.status }).from(users).where(eq(users.id, userId));
    return row?.status === "active";
  }

  /** Puntuación de la marca del jugador en ese ranking, desde PostgreSQL (por clave primaria), o `null`. */
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
      // Sin cuenta: la posición que tendría, sin escribir en el ranking.
      return { kind: "would_rank", rank: await deps.store.positionFor(board, score) };
    }

    const userId = game.userId;
    if (!(await isActive(userId))) {
      // Shadow-ban (spec §4.7): ve una posición "como si estuviera", pero nadie más la ve.
      const rank = await deps.store.positionFor(board, (await bestScore(userId, board)) ?? score);
      return { kind: "ranked", rank, improved: game.improved };
    }

    // Solo si ha mejorado su marca. Si a Redis le falta el jugador (perdió datos o falló una
    // escritura), se repara con su marca de PostgreSQL, la fuente de verdad (spec §5.2).
    if (game.improved) await deps.store.add([{ board, userId, score }]);
    let listed = await deps.store.position(board, userId);
    if (listed === null) {
      const best = await bestScore(userId, board);
      if (best !== null) await deps.store.add([{ board, userId, score: best }]);
      listed = await deps.store.position(board, userId);
    }
    // Si le han sancionado o ha borrado la cuenta mientras tanto, se deshace lo escrito (spec 4a §3.5):
    // si la sanción llegó antes de esta lectura, limpia la partida; si llega después, limpia la sanción.
    if (!(await isActive(userId))) await deps.store.remove(userId, [board]);
    const rank = listed ?? (await deps.store.positionFor(board, score));
    if (game.improved && rank <= TOP_SIZE) {
      try {
        deps.onTopChanged([board]);
      } catch (error) {
        // La página se regenera igual a los 60 s: no es motivo para perder la posición ya calculada.
        console.error("leaderboard revalidation failed", error);
      }
    }
    return { kind: "ranked", rank, improved: game.improved };
  }

  /**
   * Publica la marca que ha mejorado la partida y calcula su posición en el ranking de su idioma y
   * teclado (spec §5.5–5.6). No lanza: la partida ya está guardada, y si Redis falla se responde sin
   * posición (`unavailable`).
   */
  async function rankGame(game: RankGameInput): Promise<GameRanking> {
    try {
      return await computeRanking(game);
    } catch (error) {
      console.error("ranking failed", error);
      return { kind: "unavailable", canSave: game.userId === null };
    }
  }

  /** Posición del jugador en un ranking y su marca (`GET /api/leaderboard/me`). */
  async function myPosition(userId: string, board: Board): Promise<MyPositionResponse> {
    const [best] = await deps.db
      .select({ wpm: bests.wpm, accuracy: bests.accuracy, score: bests.score, status: users.status })
      .from(bests)
      .innerJoin(users, eq(users.id, bests.userId))
      .where(and(eq(bests.userId, userId), isBoard(board)));
    if (!best) return { rank: null };
    // En shadow-ban no está en Redis: su posición "como si estuviera" (spec §4.7).
    const listed = best.status === "active" ? await deps.store.position(board, userId) : null;
    return { rank: listed ?? (await deps.store.positionFor(board, best.score)), wpm: best.wpm, accuracy: best.accuracy };
  }

  return { rankGame, myPosition };
}

export type Ranking = ReturnType<typeof createRanking>;
