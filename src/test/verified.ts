import { TEST_LANGUAGES } from "@/lib/words/languages";
import type { DbExecutor } from "@/server/db/client";
import { verifiedLevels } from "@/server/db/schema";

/**
 * Leaves a player verified at 1,000 WPM in every language and keyboard: their games never end up
 * in `review` (spec 4b §2.1). For the tests that set up published records with `createSaveGame`.
 */
export async function verifyEverywhere(db: DbExecutor, userId: string): Promise<void> {
  await db.insert(verifiedLevels).values(
    TEST_LANGUAGES.flatMap((language) =>
      (["physical", "touch"] as const).map((inputType) => ({ userId, language, inputType, wpm: 1_000 })),
    ),
  );
}
