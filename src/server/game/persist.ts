import "server-only";
import { gzipSync } from "node:zlib";
import type { InputType, RejectReason, Verdict } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db, DbExecutor } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import type { ReceivedBatch } from "../anticheat/rules";
import { recordBests, type ImprovedBest } from "../leaderboard/bests";
import { RANKED_MIN_ACCURACY } from "../leaderboard/score";

export interface GameRecord {
  id: string;
  userId: string | null;
  anonId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  verdict: Verdict;
  rejectReason: RejectReason | null;
  ipHash: string | null;
  startsAt: Date;
  finishedAt: Date;
  batches: ReceivedBatch[];
}

export interface SavedGame {
  /** Periodos en que la partida mejora la marca del jugador (vacío si no cuenta para el ranking). */
  improved: ImprovedBest[];
}

export type SaveGame = (record: GameRecord) => Promise<SavedGame>;

/**
 * Si la partida cuenta para el ranking (válida, de un jugador con cuenta y con al menos un 90 % de
 * precisión, spec §3.3), guarda sus marcas. La usan el final de la partida y el reclamo.
 */
export async function recordGameBests(
  db: DbExecutor,
  game: Pick<GameRecord, "id" | "userId" | "language" | "inputType" | "wpm" | "accuracy" | "verdict" | "startsAt">,
): Promise<ImprovedBest[]> {
  if (game.userId === null || game.verdict !== "valid" || game.accuracy < RANKED_MIN_ACCURACY) return [];
  return recordBests(db, {
    userId: game.userId,
    gameId: game.id,
    language: game.language,
    inputType: game.inputType,
    wpm: game.wpm,
    accuracy: game.accuracy,
    achievedAt: game.startsAt,
  });
}

/** Guarda la partida, sus pulsaciones y, si cuenta para el ranking, sus marcas: todo en una transacción (spec §5.5). */
export function createSaveGame(db: Db): SaveGame {
  return async ({ batches, ...game }) =>
    db.transaction(async (tx) => {
      await tx.insert(games).values(game);
      await tx.insert(keystrokeLogs).values({
        gameId: game.id,
        events: gzipSync(JSON.stringify(batches)),
      });
      return { improved: await recordGameBests(tx, game) };
    });
}
