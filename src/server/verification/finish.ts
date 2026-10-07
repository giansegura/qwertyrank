import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { InputType, Verdict } from "@/lib/game/types";
import { VERIFICATION_ATTEMPTS, VERIFICATION_MIN_ACCURACY, requiredWpm } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { games, recordVerifications, users, verifiedLevels } from "../db/schema";
import { insertGame, type GameRecord } from "../game/persist";
import type { StartedVerification } from "../game/store";
import { recordBests, type ImprovedBest } from "../leaderboard/bests";

/** Una partida publicada al superar la verificación, lista para `rankGame`. */
export interface PublishedGame {
  gameId: string;
  userId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
  startsAt: Date;
  /** Periodos en que mejora la marca del jugador (de `recordBests`). */
  improved: ImprovedBest[];
}

/**
 * - `failed`: no la ha superado; `attemptsLeft: 0` si ya no quedan intentos o la verificación está cerrada.
 * - `verified`: récord publicado. `published`, las partidas que acaban de pasar a `valid`, de la más antigua
 *   a la más nueva (vacío si otro dispositivo ya la había verificado); `target`, la del récord.
 */
export type VerificationResult =
  | { kind: "failed"; requiredWpm: number; attemptsLeft: number }
  | { kind: "verified"; target: PublishedGame; published: PublishedGame[] };

export type SaveVerificationGame = (record: GameRecord, verification: StartedVerification) => Promise<VerificationResult>;

/**
 * Spec 4b §3.3: se supera con una partida válida, con al menos un 90 % de precisión, del mismo teclado y
 * con al menos las PPM necesarias (en centésimas enteras, como `requiredWpm`).
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

/** Tras un intento fallido: si era el tercero se cierra; si no, quedan los que no se han gastado. */
export function afterFailure(attempt: number, attemptsSpent: number): { close: boolean; attemptsLeft: number } {
  const close = attempt >= VERIFICATION_ATTEMPTS;
  return { close, attemptsLeft: close ? 0 : Math.max(0, VERIFICATION_ATTEMPTS - attemptsSpent) };
}

/** La cuenta se ha borrado a mitad de intento: no hay nada que verificar. */
const accountGone = (): VerificationResult => ({ kind: "failed", requiredWpm: 0, attemptsLeft: 0 });

/**
 * Guarda una partida de verificación y la juzga, todo en una transacción (spec 4b §3.3): si falla algo,
 * `finish` se puede repetir. Se juzga contra el objetivo vigente al terminar, con la verificación
 * bloqueada: dos finales a la vez (dos dispositivos) se esperan. La caducidad no se mira: una partida
 * empezada a tiempo puede terminar después.
 */
export function createSaveVerificationGame(db: Db): SaveVerificationGame {
  return (record, started) =>
    db.transaction(async (tx): Promise<VerificationResult> => {
      // Primero el jugador (FOR KEY SHARE, el cerrojo que toma la clave ajena al insertar la partida) y
      // después la verificación: el orden del borrado de la cuenta, que bloquea al usuario y después borra
      // en cascada sus verificaciones. En el orden contrario, los dos se esperarían (deadlock). Si el
      // jugador ya no existe, ha borrado la cuenta a mitad de intento y su verificación ha caído en
      // cascada: no hay nada que verificar, y la partida no se guarda (su usuario ya no existe).
      const [player] = record.userId
        ? await tx.select({ id: users.id }).from(users).where(eq(users.id, record.userId)).for("key share")
        : [];
      if (!player) return accountGone();

      // Después, la verificación sola. Con un JOIN a su partida, si mientras espera el cerrojo otra partida
      // pasa a ser el objetivo, PostgreSQL vuelve a comprobar la fila contra la partida de antes y no
      // devuelve nada.
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
      // Y su objetivo de ahora, ya con la verificación bloqueada.
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
        improved: [],
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

      // 1. Todas las partidas `review` de la verificación pasan a `valid`…
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
      // 2. …con sus marcas, cada una con su hora original: una partida de ayer cuenta en el ranking de ayer.
      const published: PublishedGame[] = [];
      for (const game of reviewed.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
        const improved = await recordBests(tx, {
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
      // 3. El nivel verificado sube al del récord (nunca baja).
      await tx
        .insert(verifiedLevels)
        .values({ userId: current.userId, language: target.language, inputType: current.inputType, wpm: target.wpm })
        .onConflictDoUpdate({
          target: [verifiedLevels.userId, verifiedLevels.language, verifiedLevels.inputType],
          set: { wpm: sql`excluded.wpm`, verifiedAt: sql`now()` },
          setWhere: sql`excluded.wpm > ${verifiedLevels.wpm}`,
        });
      // 4. Verificada.
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
