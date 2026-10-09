import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import { VERIFICATION_ATTEMPTS, VERIFICATION_MIN_ACCURACY, requiredWpm } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { games, recordVerifications, users, verifiedLevels } from "../db/schema";
import { insertGame, type GameRecord } from "../game/persist";
import type { StartedVerification } from "../game/store";
import { recordBest } from "../leaderboard/bests";

/** A game published on passing the verification, ready for `rankGame`. */
export interface PublishedGame {
  gameId: string;
  userId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
  startsAt: Date;
  /** Whether it improves the player's best (from `recordBest`). */
  improved: boolean;
}

/**
 * - `failed`: not passed; `attemptsLeft: 0` if no attempts are left or the verification is closed.
 * - `verified`: record published. `published`, the games that just became `valid`, from oldest
 *   to newest (empty if another device had already verified it); `target`, the record's game.
 */
export type VerificationResult =
  | { kind: "failed"; requiredWpm: number; attemptsLeft: number }
  | { kind: "verified"; target: PublishedGame; published: PublishedGame[] };

export type SaveVerificationGame = (record: GameRecord, verification: StartedVerification) => Promise<VerificationResult>;

/**
 * Spec 4b §3.3: passed with a valid game, with at least 90% accuracy, on the same keyboard and
 * with at least the required WPM (in whole hundredths, like `requiredWpm`).
 */
export function passesVerification(
  game: { verdict: Verdict; accuracy: number; inputType: InputType; wpm: number },
  verification: { inputType: InputType; targetWpm: number },
): boolean {
  return (
    game.verdict === "valid" &&
    game.accuracy >= VERIFICATION_MIN_ACCURACY &&
    game.inputType === verification.inputType &&
    Math.round(game.wpm * 100) >= Math.round(requiredWpm(verification.targetWpm) * 100)
  );
}

/** After a failed attempt: if it was the third it is closed; otherwise, the unspent ones remain. */
export function afterFailure(attempt: number, attemptsSpent: number): { close: boolean; attemptsLeft: number } {
  const close = attempt >= VERIFICATION_ATTEMPTS;
  return { close, attemptsLeft: close ? 0 : Math.max(0, VERIFICATION_ATTEMPTS - attemptsSpent) };
}

/** The account was deleted mid-attempt: there is nothing to verify. */
const accountGone = (): VerificationResult => ({ kind: "failed", requiredWpm: 0, attemptsLeft: 0 });

/**
 * Saves a verification game and judges it, all in one transaction (spec 4b §3.3): if anything fails,
 * `finish` can be retried. It is judged against the target current at the finish, with the verification
 * locked: two finishes at once (two devices) wait for each other. Expiry is not checked: a game
 * started in time may finish later.
 */
export function createSaveVerificationGame(db: Db): SaveVerificationGame {
  return (record, started) =>
    db.transaction(async (tx): Promise<VerificationResult> => {
      // First the player (FOR KEY SHARE, the lock the foreign key takes when inserting the game) and
      // then the verification: the same order as account deletion, which locks the user and then
      // cascade-deletes their verifications. In the opposite order, both would wait (deadlock). If the
      // player no longer exists, they deleted the account mid-attempt and their verification was
      // cascade-deleted: there is nothing to verify, and the game is not saved (its user no longer exists).
      const [player] = record.userId
        ? await tx.select({ id: users.id }).from(users).where(eq(users.id, record.userId)).for("key share")
        : [];
      if (!player) return accountGone();

      // Then, the verification alone. With a JOIN to its game, if another game becomes the target while
      // waiting for the lock, PostgreSQL rechecks the row against the previous game and returns
      // nothing.
      const [current] = await tx
        .select({
          status: recordVerifications.status,
          attempts: recordVerifications.attempts,
          inputType: recordVerifications.inputType,
          gameId: recordVerifications.gameId,
          userId: recordVerifications.userId,
        })
        .from(recordVerifications)
        .where(eq(recordVerifications.id, started.id))
        .for("update");
      if (!current) return accountGone();
      // And its current target, with the verification already locked.
      const [targetGame] = await tx
        .select({ language: games.language, wpm: games.wpm, accuracy: games.accuracy, startsAt: games.startsAt })
        .from(games)
        .where(eq(games.id, current.gameId));

      await insertGame(tx, record, { mode: "verification", verificationId: started.id });

      const target: PublishedGame = {
        gameId: current.gameId,
        userId: current.userId,
        inputType: current.inputType,
        ...targetGame,
        improved: false,
      };
      const required = requiredWpm(target.wpm);
      if (current.status === "verified") return { kind: "verified", target, published: [] };
      if (current.status === "failed") return { kind: "failed", requiredWpm: required, attemptsLeft: 0 };

      if (!passesVerification(record, { inputType: current.inputType, targetWpm: target.wpm })) {
        const { close, attemptsLeft } = afterFailure(started.attempt, current.attempts);
        if (close) {
          await tx
            .update(recordVerifications)
            .set({ status: "failed", resolvedAt: sql`now()` })
            .where(eq(recordVerifications.id, started.id));
        }
        return { kind: "failed", requiredWpm: required, attemptsLeft };
      }

      // 1. All of the verification's `review` games become `valid`…
      const reviewed = await tx
        .update(games)
        .set({ verdict: "valid" })
        .where(and(eq(games.verificationId, started.id), eq(games.verdict, "review"), eq(games.mode, "ranked")))
        .returning({
          gameId: games.id,
          language: games.language,
          inputType: games.inputType,
          wpm: games.wpm,
          accuracy: games.accuracy,
          startsAt: games.startsAt,
        });
      // 2. …with their bests, each with its original time, which breaks ties.
      const published: PublishedGame[] = [];
      for (const game of reviewed.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
        const improved = await recordBest(tx, {
          userId: current.userId,
          gameId: game.gameId,
          language: game.language,
          inputType: game.inputType,
          wpm: game.wpm,
          accuracy: game.accuracy,
          achievedAt: game.startsAt,
        });
        published.push({ ...game, userId: current.userId, improved });
      }
      // 3. The verified level rises to the record's (it never drops).
      await tx
        .insert(verifiedLevels)
        .values({ userId: current.userId, language: target.language, inputType: current.inputType, wpm: target.wpm })
        .onConflictDoUpdate({
          target: [verifiedLevels.userId, verifiedLevels.language, verifiedLevels.inputType],
          set: { wpm: sql`excluded.wpm`, verifiedAt: sql`now()` },
          setWhere: sql`excluded.wpm > ${verifiedLevels.wpm}`,
        });
      // 4. Verified.
      await tx
        .update(recordVerifications)
        .set({ status: "verified", resolvedAt: sql`now()` })
        .where(eq(recordVerifications.id, started.id));

      return {
        kind: "verified",
        target: published.find((game) => game.gameId === current.gameId) ?? target,
        published,
      };
    });
}
