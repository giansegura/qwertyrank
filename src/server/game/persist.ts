import "server-only";
import type { InputType, RejectReason, Verdict } from "@/lib/game/types";
import type { GameMode, PendingVerification } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db, DbExecutor } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import type { ReceivedBatch } from "../anticheat/rules";
import { recordBest } from "../leaderboard/bests";
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
  /** The game's text: stored with the keystrokes so it can be replayed (spec 4b §6.3). */
  words: readonly string[];
  batches: ReceivedBatch[];
}

/** The game would enter a top 10 unverified (spec 4b §2): its position and its verification. */
export interface ReviewedGame {
  rank: number;
  verification: PendingVerification;
}

export interface SavedGame {
  /** Whether the game improves the player's best (`false` if it does not count for the ranking). */
  improved: boolean;
  /** Whether it ended up in `review`: then it writes no best (`improved` is `false`). */
  review: ReviewedGame | null;
}

export type SaveGame = (record: GameRecord) => Promise<SavedGame>;

/**
 * If the game counts for the ranking (valid, from a player with an account and with at least 90%
 * accuracy, spec §3.3), saves its best. Used by the game finish and by the claim.
 */
export async function recordGameBest(
  db: DbExecutor,
  game: Pick<GameRecord, "id" | "userId" | "language" | "inputType" | "wpm" | "accuracy" | "verdict" | "startsAt">,
): Promise<boolean> {
  if (game.userId === null || game.verdict !== "valid" || game.accuracy < RANKED_MIN_ACCURACY) return false;
  return recordBest(db, {
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
 * Inserts the game and its keystroke log, with the words. `extra` changes what does not come from the
 * anti-cheat: the `review` verdict, and the mode and verification of a verification game.
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
 * Saves the Ranked game, its keystrokes and its best in one transaction (spec §5.5). If it would enter
 * a top 10 unverified, it stays in `review`: no best and with its verification (spec 4b §2.2).
 */
export function createSaveGame(db: Db): SaveGame {
  return async (record) =>
    db.transaction(async (tx) => {
      const review = await decideReview(tx, record);
      if (!review) {
        await insertGame(tx, record);
        return { improved: await recordGameBest(tx, record), review: null };
      }
      await insertGame(tx, record, { verdict: "review" });
      const verification = await openPendingVerification(tx, {
        userId: record.userId!,
        language: record.language,
        inputType: record.inputType,
        gameId: record.id,
        wpm: record.wpm,
      });
      return { improved: false, review: { rank: review.rank, verification } };
    });
}
