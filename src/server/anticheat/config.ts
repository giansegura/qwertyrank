import "server-only";
import { z } from "zod";

/**
 * Umbrales del anti-trampas (spec §4.3 y §4.5). El código es público: los de producción viven solo en la
 * variable `ANTICHEAT_CONFIG` (un JSON con todos los campos) y tienen que ser distintos de los de desarrollo,
 * que están aquí y en el historial del repositorio. Las reglas los reciben como parámetro.
 */
export const anticheatConfigSchema = z.strictObject({
  /** Margen entre el `t` de un evento y la llegada de su tanda (§4.2). */
  timingToleranceMs: z.number().int().nonnegative(),
  /** Pulsaciones de cada ventana en la que se mide la ráfaga. */
  burstWindow: z.number().int().min(2),
  /** Mediana de intervalos entre `keydown` por debajo de la cual una ráfaga es inhumana. */
  burstMedianMs: z.number().positive(),
  /** Cuánto antes de un `input` puede estar el `keydown` que lo produce. */
  keydownLookbackMs: z.number().int().positive(),
  /** Inserciones de varias letras toleradas en táctil (autocorrector). */
  touchMultiInsertLimit: z.number().int().nonnegative(),
  /** Techo de PPM de cada teclado. */
  wpmCeiling: z.strictObject({ physical: z.number().positive(), touch: z.number().positive() }),
  /** Pulsaciones mínimas para decidir el teclado por la firma de los eventos (§4.5). */
  minKeysForSignature: z.number().int().positive(),
  /** Proporción de teclas `Unidentified` por encima de la cual el teclado es táctil. */
  unidentifiedRatio: z.number().min(0).max(1),
  /** Mediana de duración de pulsación a partir de la cual el teclado es físico. */
  physicalMinHoldMs: z.number().nonnegative(),
});

export type AnticheatConfig = z.infer<typeof anticheatConfigSchema>;

/** Umbrales de desarrollo y de los tests: públicos. Producción no los acepta (`src/server/env.ts`). */
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
 * `ANTICHEAT_CONFIG` tal como llega del entorno. Un JSON roto se rechaza sin el mensaje de `JSON.parse`, que
 * citaría parte del valor: los umbrales no deben acabar en los logs.
 */
export const anticheatConfigJson = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "ANTICHEAT_CONFIG no es un JSON válido" });
      return z.NEVER;
    }
  })
  .pipe(anticheatConfigSchema);

/** Si dos configuraciones tienen los mismos umbrales. */
export function sameAnticheatConfig(a: AnticheatConfig, b: AnticheatConfig): boolean {
  return JSON.stringify(anticheatConfigSchema.parse(a)) === JSON.stringify(anticheatConfigSchema.parse(b));
}
