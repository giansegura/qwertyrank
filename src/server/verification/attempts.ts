import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import { VERIFICATION_ATTEMPTS } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { recordVerifications } from "../db/schema";

/** Spent attempt: which verification, which attempt number (1–3) and which keyboard it must be played on. */
export interface SpentAttempt {
  id: string;
  attempt: number;
  inputType: InputType;
}

/**
 * Spends an attempt of one of the player's verifications (spec 4b §3.1) with a single `UPDATE … RETURNING`:
 * two tabs or two devices at once cannot get past the limit of 3. `null` if it is not pending, has
 * expired, has no attempts left, is not theirs or is in another language.
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
