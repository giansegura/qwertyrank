import "server-only";
import { z } from "zod";

/**
 * Anti-cheat thresholds (spec §4.3 and §4.5). The code is public: the production ones live only in the
 * `ANTICHEAT_CONFIG` variable (a JSON with every field) and must differ from the development ones, which are
 * here and in the repository history. The rules receive them as a parameter.
 */
export const anticheatConfigSchema = z.strictObject({
  /** Allowed gap between an event's `t` and the arrival of its batch (§4.2). */
  timingToleranceMs: z.number().int().nonnegative(),
  /** Keystrokes in each window over which a burst is measured. */
  burstWindow: z.number().int().min(2),
  /** Median interval between `keydown`s below which a burst is inhuman. */
  burstMedianMs: z.number().positive(),
  /** How long before an `input` the `keydown` that produces it may be. */
  keydownLookbackMs: z.number().int().positive(),
  /** Multi-letter insertions tolerated on touch (autocorrect). */
  touchMultiInsertLimit: z.number().int().nonnegative(),
  /** WPM ceiling for each keyboard. */
  wpmCeiling: z.strictObject({ physical: z.number().positive(), touch: z.number().positive() }),
  /** Minimum keystrokes to decide the keyboard from the event signature (§4.5). */
  minKeysForSignature: z.number().int().positive(),
  /** Share of `Unidentified` keys above which the keyboard is touch. */
  unidentifiedRatio: z.number().min(0).max(1),
  /** Median key hold time from which the keyboard is physical. */
  physicalMinHoldMs: z.number().nonnegative(),
});

export type AnticheatConfig = z.infer<typeof anticheatConfigSchema>;

/** Development and test thresholds: public. Production rejects them (`src/server/env.ts`). */
export const DEV_ANTICHEAT_CONFIG: AnticheatConfig = {
  timingToleranceMs: 250,
  burstWindow: 20,
  burstMedianMs: 25,
  keydownLookbackMs: 1_000,
  touchMultiInsertLimit: 2,
  wpmCeiling: { physical: 320, touch: 220 },
  minKeysForSignature: 10,
  unidentifiedRatio: 0.5,
  physicalMinHoldMs: 20,
};

/**
 * `ANTICHEAT_CONFIG` as it comes from the environment. Broken JSON is rejected without the `JSON.parse` message,
 * which would quote part of the value: the thresholds must not end up in the logs.
 */
export const anticheatConfigJson = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "ANTICHEAT_CONFIG is not valid JSON" });
      return z.NEVER;
    }
  })
  .pipe(anticheatConfigSchema);

/** Whether two configurations have the same thresholds. */
export function sameAnticheatConfig(a: AnticheatConfig, b: AnticheatConfig): boolean {
  return JSON.stringify(anticheatConfigSchema.parse(a)) === JSON.stringify(anticheatConfigSchema.parse(b));
}
