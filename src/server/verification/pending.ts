import "server-only";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import { VERIFICATION_ATTEMPTS, VERIFICATION_HOURS, requiredWpm, type PendingVerification } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { games, recordVerifications } from "../db/schema";

const EXPIRY = sql.raw(`now() + interval '${VERIFICATION_HOURS} hours'`);

/** Una fila de `record_verifications` con las PPM de su partida objetivo, como la ve el jugador. */
export function toPending(row: {
  id: string;
  language: TestLanguage;
  inputType: InputType;
  attempts: number;
  expiresAt: Date;
  targetWpm: number;
}): PendingVerification {
  return {
    id: row.id,
    language: row.language,
    inputType: row.inputType,
    targetWpm: row.targetWpm,
    requiredWpm: requiredWpm(row.targetWpm),
    attemptsLeft: Math.max(0, VERIFICATION_ATTEMPTS - row.attempts),
    expiresAt: row.expiresAt.toISOString(),
  };
}

const PENDING_FIELDS = {
  id: recordVerifications.id,
  language: recordVerifications.language,
  inputType: recordVerifications.inputType,
  attempts: recordVerifications.attempts,
  expiresAt: recordVerifications.expiresAt,
  targetWpm: games.wpm,
};

/**
 * Deja una partida `review` esperando su verificación (spec 4b §2.2), dentro de la transacción que la
 * guarda o la reclama. La partida ya debe existir: la verificación apunta a ella, y después ella a la
 * verificación (las dos tablas se apuntan).
 * - Una pendiente caducada se cierra como fallida, con `resolved_at = expires_at` (§5.1).
 * - Una pendiente sin intentos también, con `resolved_at = now()`: su último intento se abandonó (una
 *   partida nueva cierra la de verificación) y renovarla dejaría al jugador sin poder verificar nunca.
 * - Si no hay pendiente, se crea con 0 intentos y 24 h de plazo.
 * - Si la hay, apunta a la partida con más PPM de las dos y el plazo vuelve a ser de 24 h; los intentos
 *   gastados se mantienen.
 */
export async function openPendingVerification(
  tx: DbExecutor,
  input: { userId: string; language: TestLanguage; inputType: InputType; gameId: string; wpm: number },
): Promise<PendingVerification> {
  const sameBoard = and(
    eq(recordVerifications.userId, input.userId),
    eq(recordVerifications.language, input.language),
    eq(recordVerifications.inputType, input.inputType),
  );
  await tx
    .update(recordVerifications)
    .set({ status: "failed", resolvedAt: sql`${recordVerifications.expiresAt}` })
    .where(and(sameBoard, eq(recordVerifications.status, "pending"), lte(recordVerifications.expiresAt, sql`now()`)));
  await tx
    .update(recordVerifications)
    .set({ status: "failed", resolvedAt: sql`now()` })
    .where(
      and(
        sameBoard,
        eq(recordVerifications.status, "pending"),
        sql`${recordVerifications.attempts} >= ${VERIFICATION_ATTEMPTS}`,
      ),
    );

  const [row] = await tx
    .insert(recordVerifications)
    .values({
      userId: input.userId,
      language: input.language,
      inputType: input.inputType,
      gameId: input.gameId,
      expiresAt: EXPIRY,
    })
    .onConflictDoUpdate({
      target: [recordVerifications.userId, recordVerifications.language, recordVerifications.inputType],
      targetWhere: sql`${recordVerifications.status} = 'pending'`,
      set: {
        // A igualdad de PPM se queda la anterior.
        gameId: sql`case when (select ${games.wpm} from ${games} where ${games.id} = ${recordVerifications.gameId}) >= ${input.wpm}
          then ${recordVerifications.gameId} else excluded.game_id end`,
        expiresAt: sql`excluded.expires_at`,
      },
    })
    .returning({ id: recordVerifications.id, gameId: recordVerifications.gameId });

  await tx.update(games).set({ verificationId: row.id }).where(eq(games.id, input.gameId));
  const [pending] = await tx
    .select(PENDING_FIELDS)
    .from(recordVerifications)
    .innerJoin(games, eq(games.id, recordVerifications.gameId))
    .where(eq(recordVerifications.id, row.id));
  return toPending(pending);
}

/** La verificación, si sigue pendiente y sin caducar (para repetir el reclamo de una partida `review`). */
export async function findPendingVerification(db: DbExecutor, id: string): Promise<PendingVerification | null> {
  const [row] = await db
    .select(PENDING_FIELDS)
    .from(recordVerifications)
    .innerJoin(games, eq(games.id, recordVerifications.gameId))
    .where(
      and(
        eq(recordVerifications.id, id),
        eq(recordVerifications.status, "pending"),
        gt(recordVerifications.expiresAt, sql`now()`),
      ),
    );
  return row ? toPending(row) : null;
}
