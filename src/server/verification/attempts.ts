import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import { VERIFICATION_ATTEMPTS } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { recordVerifications } from "../db/schema";

/** Intento gastado: qué verificación, qué número de intento (1–3) y con qué teclado hay que jugarlo. */
export interface SpentAttempt {
  id: string;
  attempt: number;
  inputType: InputType;
}

/**
 * Gasta un intento de una verificación del jugador (spec 4b §3.1) con un solo `UPDATE … RETURNING`:
 * dos pestañas o dos dispositivos a la vez no se saltan el límite de 3. `null` si no está pendiente, ha
 * caducado, ya no quedan intentos, no es suya o es de otro idioma.
 */
export async function spendAttempt(
  db: DbExecutor,
  input: { verificationId: string; userId: string; language: TestLanguage },
): Promise<SpentAttempt | null> {
  const [row] = await db
    .update(recordVerifications)
    .set({ attempts: sql`${recordVerifications.attempts} + 1` })
    .where(
      and(
        eq(recordVerifications.id, input.verificationId),
        eq(recordVerifications.userId, input.userId),
        eq(recordVerifications.language, input.language),
        eq(recordVerifications.status, "pending"),
        lt(recordVerifications.attempts, VERIFICATION_ATTEMPTS),
        gt(recordVerifications.expiresAt, sql`now()`),
      ),
    )
    .returning({
      id: recordVerifications.id,
      attempt: recordVerifications.attempts,
      inputType: recordVerifications.inputType,
    });
  return row ?? null;
}
