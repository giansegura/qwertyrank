import "server-only";
import { and, asc, eq, gt, lt, lte, sql } from "drizzle-orm";
import type { InputType } from "@/lib/game/types";
import { VERIFICATION_ATTEMPTS, VERIFICATION_HOURS, requiredWpm, type PendingVerification } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { DbExecutor } from "../db/client";
import { games, recordVerifications } from "../db/schema";

const EXPIRY = sql.raw(`now() + interval '${VERIFICATION_HOURS} hours'`);

/** A `record_verifications` row with the WPM of its target game, as the player sees it. */
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
 * Leaves a `review` game awaiting its verification (spec 4b §2.2), inside the transaction that saves
 * or claims it. The game must already exist: the verification points to it, and then it to the
 * verification (the two tables point to each other).
 * - An expired pending one is closed as failed, with `resolved_at = expires_at` (§5.1).
 * - A pending one with no attempts left too, with `resolved_at = now()`: its last attempt was abandoned (a
 *   new game closes the verification one) and renewing it would leave the player never able to verify.
 * - If there is no pending one, it is created with 0 attempts and a 24 h deadline.
 * - If there is, it points to the game with the higher WPM of the two (also if both are saved at once) and
 *   the deadline goes back to 24 h; the spent attempts are kept.
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
      set: { expiresAt: sql`excluded.expires_at` },
    })
    .returning({ id: recordVerifications.id });

  // The target changes in a separate statement. If the upsert waited on the pending one another
  // transaction was opening, its snapshot does not see that other transaction's game; a new statement does
  // (READ COMMITTED), and the row is already ours. With equal WPM the previous one stays.
  await tx
    .update(recordVerifications)
    .set({ gameId: input.gameId })
    .where(
      and(
        eq(recordVerifications.id, row.id),
        sql`(select ${games.wpm} from ${games} where ${games.id} = ${recordVerifications.gameId}) < ${input.wpm}`,
      ),
    );
  await tx.update(games).set({ verificationId: row.id }).where(eq(games.id, input.gameId));
  const [pending] = await tx
    .select(PENDING_FIELDS)
    .from(recordVerifications)
    .innerJoin(games, eq(games.id, recordVerifications.gameId))
    .where(eq(recordVerifications.id, row.id));
  return toPending(pending);
}

/** The verification, if still pending and unexpired (for repeating the claim of a `review` game). */
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

/**
 * The verifications the player can still do (spec 4b §4.3): pending, unexpired and with attempts
 * left; the one expiring soonest first. Shared by `GET /api/verification` and `/verify`.
 */
export async function pendingVerifications(db: DbExecutor, userId: string): Promise<PendingVerification[]> {
  const rows = await db
    .select(PENDING_FIELDS)
    .from(recordVerifications)
    .innerJoin(games, eq(games.id, recordVerifications.gameId))
    .where(
      and(
        eq(recordVerifications.userId, userId),
        eq(recordVerifications.status, "pending"),
        gt(recordVerifications.expiresAt, sql`now()`),
        lt(recordVerifications.attempts, VERIFICATION_ATTEMPTS),
      ),
    )
    .orderBy(asc(recordVerifications.expiresAt));
  return rows.map(toPending);
}
