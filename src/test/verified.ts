import { TEST_LANGUAGES } from "@/lib/words/languages";
import type { DbExecutor } from "@/server/db/client";
import { verifiedLevels } from "@/server/db/schema";

/**
 * Deja a un jugador verificado a 1.000 PPM en todos los idiomas y teclados: sus partidas nunca quedan
 * en `review` (spec 4b §2.1). Para las pruebas que preparan marcas publicadas con `createSaveGame`.
 */
export async function verifyEverywhere(db: DbExecutor, userId: string): Promise<void> {
  await db.insert(verifiedLevels).values(
    TEST_LANGUAGES.flatMap((language) =>
      (["physical", "touch"] as const).map((inputType) => ({ userId, language, inputType, wpm: 1_000 })),
    ),
  );
}
