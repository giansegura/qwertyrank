import type { InputType } from "@/lib/game/types";

/**
 * Cada ranking (un teclado, en el idioma de la página) es una ruta fija declarada en `src/i18n/routing.ts`
 * con su URL en cada idioma (`/es/ranking/fisico`, spec §7.1). Así next-intl traduce, cambia de idioma y
 * redirige desde la URL de otro idioma por sí solo. Por dentro, los valores van en inglés.
 */

export const INPUT_TYPES = ["physical", "touch"] as const satisfies readonly InputType[];

export type LeaderboardPathname = `/leaderboard/${InputType}`;

/** Ruta de un ranking para `Link`, `getPathname` o `redirect`; con el idioma delante es su clave en la caché. */
export function leaderboardHref(input: InputType): LeaderboardPathname {
  return `/leaderboard/${input}`;
}

/** El parámetro de la página (siempre el interno, en inglés): qué teclado es, o `null`. */
export function parseInput(input: string): InputType | null {
  return INPUT_TYPES.find((option) => option === input) ?? null;
}
