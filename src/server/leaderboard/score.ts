import "server-only";

/** Para entrar en el ranking hace falta al menos este porcentaje de precisión (spec §3.3). */
export const RANKED_MIN_ACCURACY = 90;
/** Origen de los minutos del desempate (spec §5.4): hay margen para ~31 años. */
export const SCORE_EPOCH = Date.UTC(2026, 0, 1);

const WPM_UNIT = 2 ** 34;
const ACCURACY_UNIT = 2 ** 24;

/**
 * Puntuación compuesta (spec §5.4), un entero exacto < 2^53:
 * `wpm_centi × 2^34 + accuracy_permille × 2^24 + (2^24 − 1 − minutos desde 2026-01-01)`.
 * A igualdad de PPM y precisión, la partida anterior tiene más puntuación.
 */
export function encodeScore({ wpm, accuracy, achievedAt }: { wpm: number; accuracy: number; achievedAt: Date }): number {
  const wpmCenti = Math.min(Math.max(Math.round(wpm * 100), 0), 40_000);
  const accuracyPermille = Math.min(Math.max(Math.round(accuracy * 10), 0), 1_000);
  const minutes = Math.min(Math.max(Math.floor((achievedAt.getTime() - SCORE_EPOCH) / 60_000), 0), ACCURACY_UNIT - 1);
  return wpmCenti * WPM_UNIT + accuracyPermille * ACCURACY_UNIT + (ACCURACY_UNIT - 1 - minutes);
}
