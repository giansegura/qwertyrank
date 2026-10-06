import "server-only";
import { and, eq, or } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import { PERIODS, VISIBLE_PERIODS, periodKeys, type Period, type VisiblePeriod } from "@/lib/leaderboard/periods";
import type { GameRanking, MyPositionResponse, PeriodRanks } from "@/lib/leaderboard/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { periodBests, users } from "../db/schema";
import { isBoard, type ImprovedBest } from "./bests";
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
  /** Periodos en que la partida ha mejorado la marca del jugador (de `recordBests`). */
  improved: ImprovedBest[];
}

/** Un ranking visible cuyo top 100 ha cambiado. */
export interface BoardChange {
  language: TestLanguage;
  inputType: InputType;
  period: VisiblePeriod;
}

export interface RankingDeps {
  db: Db;
  store: LeaderboardStore;
  /** En producción, `revalidatePath` de la página de cada ranking que cambia. */
  onTopChanged: (changes: BoardChange[]) => void;
  /** Hora actual; los tests la fijan. */
  now?: () => Date;
}

type VisibleBoard = Board & { period: VisiblePeriod };

const isVisible = (period: string): period is VisiblePeriod => (VISIBLE_PERIODS as readonly string[]).includes(period);

export function createRanking(deps: RankingDeps) {
  async function isActive(userId: string): Promise<boolean> {
    const [row] = await deps.db.select({ status: users.status }).from(users).where(eq(users.id, userId));
    return row?.status === "active";
  }

  async function ranksFor(
    boards: VisibleBoard[],
    position: (board: VisibleBoard, index: number) => Promise<number>,
  ): Promise<PeriodRanks> {
    const values = await Promise.all(boards.map(position));
    return Object.fromEntries(boards.map((board, index) => [board.period, values[index]])) as PeriodRanks;
  }

  /** Mejores marcas del jugador en los 5 periodos de esa partida, desde PostgreSQL (por clave primaria). */
  async function bestsFor(userId: string, game: RankGameInput, keys: Record<Period, string>): Promise<ImprovedBest[]> {
    return deps.db
      .select({ period: periodBests.periodType, key: periodBests.periodKey, score: periodBests.score })
      .from(periodBests)
      .where(
        and(
          eq(periodBests.userId, userId),
          or(...PERIODS.map((period) => isBoard({ language: game.language, inputType: game.inputType, period, key: keys[period] }))),
        ),
      );
  }

  async function computeRanking(game: RankGameInput): Promise<GameRanking> {
    if (game.verdict !== "valid") return { kind: "unranked" };
    if (game.accuracy < RANKED_MIN_ACCURACY) return { kind: "low_accuracy" };

    const keys = periodKeys(game.startsAt);
    const current = periodKeys(deps.now?.() ?? new Date());
    // Posiciones solo en los rankings que siguen abiertos: si la partida empezó antes de medianoche y
    // acabó (o se reclama) después, cuenta en el de ayer, pero "#N hoy" sería el ranking de otro día.
    const boards: VisibleBoard[] = VISIBLE_PERIODS.filter((period) => keys[period] === current[period]).map(
      (period) => ({ language: game.language, inputType: game.inputType, period, key: keys[period] }),
    );
    const score = encodeScore({ wpm: game.wpm, accuracy: game.accuracy, achievedAt: game.startsAt });

    if (!game.userId) {
      // Sin cuenta: la posición que tendría, sin escribir en el ranking.
      return { kind: "would_rank", ranks: await ranksFor(boards, (board) => deps.store.positionFor(board, score)) };
    }

    const userId = game.userId;
    const improved = game.improved.map((best) => best.period).filter(isVisible);
    const toEntry = (best: ImprovedBest) => ({
      board: { language: game.language, inputType: game.inputType, period: best.period, key: best.key },
      userId,
      score: best.score,
      achievedAt: game.startsAt,
    });

    if (!(await isActive(userId))) {
      // Shadow-ban (spec §4.7): ve una posición "como si estuviera", pero nadie más la ve.
      const bests = await bestsFor(userId, game, keys);
      const bestScore = (board: VisibleBoard) => bests.find((best) => best.period === board.period)?.score ?? score;
      return { kind: "ranked", ranks: await ranksFor(boards, (board) => deps.store.positionFor(board, bestScore(board))), improved };
    }

    // Solo las marcas mejoradas. Si a Redis le falta el jugador en algún ranking (perdió datos o
    // falló una escritura), se repara con sus marcas de PostgreSQL, la fuente de verdad (spec §5.2).
    await deps.store.add(game.improved.map(toEntry));
    const positions = () => Promise.all(boards.map((board) => deps.store.position(board, userId)));
    let listed = await positions();
    if (listed.includes(null)) {
      await deps.store.add((await bestsFor(userId, game, keys)).map(toEntry));
      listed = await positions();
    }
    // Si le han sancionado o ha borrado la cuenta mientras tanto, se deshace lo escrito (spec 4a §3.5):
    // si la sanción llegó antes de esta lectura, limpia la partida; si llega después, limpia la sanción.
    if (!(await isActive(userId))) {
      await deps.store.remove(
        userId,
        PERIODS.map((period) => ({ language: game.language, inputType: game.inputType, period, key: keys[period] })),
      );
    }
    const ranks = await ranksFor(boards, async (board, index) => listed[index] ?? deps.store.positionFor(board, score));
    const changes = boards
      .filter((board) => improved.includes(board.period) && (ranks[board.period] ?? Infinity) <= TOP_SIZE)
      .map(({ language, inputType, period }) => ({ language, inputType, period }));
    if (changes.length > 0) {
      try {
        deps.onTopChanged(changes);
      } catch (error) {
        // La página se regenera igual a los 60 s: no es motivo para perder las posiciones ya calculadas.
        console.error("leaderboard revalidation failed", error);
      }
    }
    return { kind: "ranked", ranks, improved };
  }

  /**
   * Publica las marcas que ha mejorado la partida y calcula sus posiciones en los rankings de los
   * periodos en que se jugó (spec §5.5–5.6). No lanza: la partida ya está guardada, y si Redis
   * falla se responde sin posiciones (`unavailable`).
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
      .select({ wpm: periodBests.wpm, accuracy: periodBests.accuracy, score: periodBests.score, status: users.status })
      .from(periodBests)
      .innerJoin(users, eq(users.id, periodBests.userId))
      .where(and(eq(periodBests.userId, userId), isBoard(board)));
    if (!best) return { rank: null };
    // En shadow-ban no está en Redis: su posición "como si estuviera" (spec §4.7).
    const listed = best.status === "active" ? await deps.store.position(board, userId) : null;
    return { rank: listed ?? (await deps.store.positionFor(board, best.score)), wpm: best.wpm, accuracy: best.accuracy };
  }

  return { rankGame, myPosition };
}

export type Ranking = ReturnType<typeof createRanking>;
