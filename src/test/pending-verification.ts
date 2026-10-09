import { randomUUID } from "node:crypto";
import type { InputType } from "@/lib/game/types";
import type { PendingVerification } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "@/server/db/client";
import { insertGame } from "@/server/game/persist";
import { openPendingVerification } from "@/server/verification/pending";

/**
 * A `review` game of `userId` awaiting its verification, as `finish` leaves it (spec 4b §2.2), without
 * depending on who else is in the rankings of the test database.
 */
export async function seedPendingVerification(
  db: Db,
  userId: string,
  {
    wpm = 100,
    accuracy = 98,
    startsAt = new Date(),
    language = "en" as TestLanguage,
    inputType = "physical" as InputType,
  } = {},
): Promise<{ gameId: string; verification: PendingVerification }> {
  const gameId = randomUUID();
  return db.transaction(async (tx) => {
    await insertGame(
      tx,
      {
        id: gameId,
        userId,
        anonId: randomUUID(),
        language,
        inputType,
        wpm,
        rawWpm: wpm,
        accuracy,
        verdict: "valid",
        rejectReason: null,
        ipHash: null,
        startsAt,
        finishedAt: startsAt,
        words: [],
        batches: [],
      },
      { verdict: "review" },
    );
    const verification = await openPendingVerification(tx, { userId, language, inputType, gameId, wpm });
    return { gameId, verification };
  });
}
