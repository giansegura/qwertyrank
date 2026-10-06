import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { ClaimResponse } from "@/lib/game/types";
import type { GameRanking } from "@/lib/leaderboard/types";
import type { Db } from "../db/client";
import { games } from "../db/schema";
import type { RankGameInput } from "../leaderboard/ranking";
import { recordGameBests } from "./persist";

/** Spec §3.7: una partida anónima se puede reclamar en los 10 minutos siguientes a terminarla. */
export const CLAIM_WINDOW_MINUTES = 10;

export type ClaimOutcome = { kind: "ok"; claim: ClaimResponse } | { kind: "not_found" | "expired" };

export interface ClaimDeps {
  db: Db;
  /** No lanza: si Redis falla, devuelve `unavailable` (ver `createRanking`). */
  rankGame: (game: RankGameInput) => Promise<GameRanking>;
}

export function createClaimGame(deps: ClaimDeps) {
  return async ({ gameId, anonId, userId }: { gameId: string; anonId: string; userId: string }): Promise<ClaimOutcome> => {
    // Solo partidas válidas de este navegador, sin dueño y terminadas hace menos de 10 minutos
    // (con el reloj de PostgreSQL). Al reclamarla, cuenta para los periodos en que se jugó.
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
      return game ? { game, improved: await recordGameBests(tx, game) } : null;
    });

    let game = claimed?.game;
    if (!game) {
      const [existing] = await deps.db
        .select()
        .from(games)
        .where(and(eq(games.id, gameId), eq(games.anonId, anonId)));
      if (existing?.verdict !== "valid") return { kind: "not_found" };
      if (existing.userId === null) return { kind: "expired" };
      // Ya es suya: repetir el reclamo no cambia nada. Si es de otro, para este usuario no existe.
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
      improved: claimed?.improved ?? [],
    });
    return { kind: "ok", claim: { ranking, language: game.language, inputType: game.inputType } };
  };
}
