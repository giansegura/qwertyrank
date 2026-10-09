import "server-only";

/** Getting into the ranking requires at least this accuracy percentage (spec §3.3). */
export const RANKED_MIN_ACCURACY = 90;
/** Origin of the tie-break minutes (spec §5.4): there is room for ~31 years. */
export const SCORE_EPOCH = Date.UTC(2026, 0, 1);

const WPM_UNIT = 2 ** 34;
const ACCURACY_UNIT = 2 ** 24;

/**
 * Composite score (spec §5.4), an exact integer < 2^53:
 * `wpm_centi × 2^34 + accuracy_permille × 2^24 + (2^24 − 1 − minutes since 2026-01-01)`.
 * On equal wpm and accuracy, the earlier game has the higher score.
 */
export function encodeScore({ wpm, accuracy, achievedAt }: { wpm: number; accuracy: number; achievedAt: Date }): number {
  const wpmCenti = Math.min(Math.max(Math.round(wpm * 100), 0), 40_000);
  const accuracyPermille = Math.min(Math.max(Math.round(accuracy * 10), 0), 1_000);
  const minutes = Math.min(Math.max(Math.floor((achievedAt.getTime() - SCORE_EPOCH) / 60_000), 0), ACCURACY_UNIT - 1);
  return wpmCenti * WPM_UNIT + accuracyPermille * ACCURACY_UNIT + (ACCURACY_UNIT - 1 - minutes);
}
