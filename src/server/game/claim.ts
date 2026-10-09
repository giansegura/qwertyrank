import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { ClaimResponse } from "@/lib/game/types";
import type { GameRanking } from "@/lib/leaderboard/types";
import type { Db } from "../db/client";
import { games } from "../db/schema";
import type { RankGameInput } from "../leaderboard/ranking";
import { encodeScore } from "../leaderboard/score";
import { findPendingVerification, openPendingVerification } from "../verification/pending";
import { boardStanding, decideReview } from "../verification/review";
import { recordGameBest, type ReviewedGame } from "./persist";

/** Spec §3.7: an anonymous game can be claimed within 10 minutes of finishing it. */
export const CLAIM_WINDOW_MINUTES = 10;

export type ClaimOutcome = { kind: "ok"; claim: ClaimResponse } | { kind: "not_found" | "expired" };

export interface ClaimDeps {
  db: Db;
  /** Does not throw: if Redis fails, it returns `unavailable` (see `createRanking`). */
  rankGame: (game: RankGameInput) => Promise<GameRanking>;
}

type ClaimedGame = typeof games.$inferSelect;

export function createClaimGame(deps: ClaimDeps) {
  /** Repeating the claim of a game in `review`: its verification, if still pending (spec 4b §2.4). */
  async function reviewRanking(game: ClaimedGame & { userId: string }): Promise<GameRanking> {
    const verification = game.verificationId ? await findPendingVerification(deps.db, game.verificationId) : null;
    if (!verification) return { kind: "unranked" };
    const score = encodeScore({ wpm: game.wpm, accuracy: game.accuracy, achievedAt: game.startsAt });
    const standing = await boardStanding(deps.db, game, score);
    return { kind: "review", rank: standing.ahead + 1, verification };
  }

  return async ({ gameId, anonId, userId }: { gameId: string; anonId: string; userId: string }): Promise<ClaimOutcome> => {
    // Only valid games from this browser, with no owner and finished less than 10 minutes ago
    // (by the PostgreSQL clock). Once claimed, it counts in the ranking for its language and keyboard; if
    // it would enter a top 10 unverified, it stays in `review` (spec 4b §2.1).
    const claimed = await deps.db.transaction(async (tx) => {
      const [game] = await tx
        .update(games)
        .set({ userId, claimedAt: sql`now()` })
        .where(
          and(
            eq(games.id, gameId),
            eq(games.anonId, anonId),
            isNull(games.userId),
            eq(games.verdict, "valid"),
            sql`${games.finishedAt} > now() - ${sql.raw(`interval '${CLAIM_WINDOW_MINUTES} minutes'`)}`,
          ),
        )
        .returning();
      if (!game) return null;
      const review = await decideReview(tx, game);
      if (!review) return { game, improved: await recordGameBest(tx, game), review: null };
      await tx.update(games).set({ verdict: "review" }).where(eq(games.id, game.id));
      const verification = await openPendingVerification(tx, {
        userId,
        language: game.language,
        inputType: game.inputType,
        gameId: game.id,
        wpm: game.wpm,
      });
      return { game, improved: false, review: { rank: review.rank, verification } satisfies ReviewedGame };
    });

    if (claimed?.review) {
      const { language, inputType } = claimed.game;
      return { kind: "ok", claim: { ranking: { kind: "review", ...claimed.review }, language, inputType } };
    }

    let game = claimed?.game;
    if (!game) {
      const [existing] = await deps.db
        .select()
        .from(games)
        .where(and(eq(games.id, gameId), eq(games.anonId, anonId)));
      // Already theirs and awaiting verification: repeating the claim (e.g. on reload) shows the same.
      if (existing?.verdict === "review" && existing.userId === userId) {
        const ranking = await reviewRanking({ ...existing, userId });
        return { kind: "ok", claim: { ranking, language: existing.language, inputType: existing.inputType } };
      }
      if (existing?.verdict !== "valid") return { kind: "not_found" };
      if (existing.userId === null) return { kind: "expired" };
      // Already theirs: repeating the claim changes nothing. If it is someone else's, it does not exist for this user.
      if (existing.userId !== userId) return { kind: "not_found" };
      game = existing;
    }

    const ranking = await deps.rankGame({
      userId,
      language: game.language,
      inputType: game.inputType,
      verdict: "valid",
      wpm: game.wpm,
      accuracy: game.accuracy,
      startsAt: game.startsAt,
      improved: claimed?.improved ?? false,
    });
    return { kind: "ok", claim: { ranking, language: game.language, inputType: game.inputType } };
  };
}
