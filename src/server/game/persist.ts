import "server-only";
import type { InputType, RejectReason, Verdict } from "@/lib/game/types";
import type { PeriodRanks } from "@/lib/leaderboard/types";
import type { GameMode, PendingVerification } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db, DbExecutor } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import type { ReceivedBatch } from "../anticheat/rules";
import { recordBests, type ImprovedBest } from "../leaderboard/bests";
import { RANKED_MIN_ACCURACY } from "../leaderboard/score";
import { openPendingVerification } from "../verification/pending";
import { decideReview } from "../verification/review";
import { encodeKeystrokeLog } from "./keystroke-log";

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
  /** El texto de la partida: se guarda con las pulsaciones para poder reproducirla (spec 4b §6.3). */
  words: readonly string[];
  batches: ReceivedBatch[];
}

/** La partida entraría en un top 10 sin verificar (spec 4b §2): sus posiciones y su verificación. */
export interface ReviewedGame {
  ranks: PeriodRanks;
  verification: PendingVerification;
}

export interface SavedGame {
  /** Periodos en que la partida mejora la marca del jugador (vacío si no cuenta para el ranking). */
  improved: ImprovedBest[];
  /** Si ha quedado en `review`: entonces no escribe marcas (`improved` vacío). */
  review: ReviewedGame | null;
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

/**
 * Inserta la partida y su registro de pulsaciones, con las palabras. `extra` cambia lo que no sale del
 * anti-trampas: el veredicto `review` y el modo y la verificación de una partida de verificación.
 */
export async function insertGame(
  tx: DbExecutor,
  { words, batches, ...game }: GameRecord,
  extra: { verdict?: Verdict; mode?: GameMode; verificationId?: string } = {},
): Promise<void> {
  await tx.insert(games).values({ ...game, ...extra });
  await tx.insert(keystrokeLogs).values({ gameId: game.id, events: encodeKeystrokeLog({ words, batches }) });
}

/**
 * Guarda la partida Ranked, sus pulsaciones y sus marcas en una transacción (spec §5.5). Si entraría
 * en un top 10 sin verificar, queda en `review`: sin marcas y con su verificación (spec 4b §2.2).
 */
export function createSaveGame(db: Db, { now = () => new Date() }: { now?: () => Date } = {}): SaveGame {
  return async (record) =>
    db.transaction(async (tx) => {
      const review = await decideReview(tx, record, now());
      if (!review) {
        await insertGame(tx, record);
        return { improved: await recordGameBests(tx, record), review: null };
      }
      await insertGame(tx, record, { verdict: "review" });
      const verification = await openPendingVerification(tx, {
        userId: record.userId!,
        language: record.language,
        inputType: record.inputType,
        gameId: record.id,
        wpm: record.wpm,
      });
      return { improved: [], review: { ranks: review.ranks, verification } };
    });
}
