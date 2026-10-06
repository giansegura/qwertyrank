import type { InputType } from "@/lib/game/types";
import { VISIBLE_PERIODS, type VisiblePeriod } from "./periods";

/**
 * Cada ranking visible (teclado × periodo) es una ruta fija declarada en `src/i18n/routing.ts`
 * con su URL en cada idioma (`/es/ranking/fisico/hoy`, spec §7.1). Así next-intl traduce, cambia
 * de idioma y redirige desde la URL de otro idioma por sí solo. Por dentro, los valores van en inglés.
 */

export const INPUT_TYPES = ["physical", "touch"] as const satisfies readonly InputType[];

const PERIOD_SEGMENTS = {
  day: "today",
  week: "week",
  month: "month",
  all: "all-time",
} as const satisfies Record<VisiblePeriod, string>;

export type LeaderboardPathname = `/leaderboard/${InputType}/${(typeof PERIOD_SEGMENTS)[VisiblePeriod]}`;

/** Ruta de un ranking para `Link`, `getPathname` o `redirect`; con el idioma delante es su clave en la caché. */
export function leaderboardHref(input: InputType, period: VisiblePeriod): LeaderboardPathname {
  return `/leaderboard/${input}/${PERIOD_SEGMENTS[period]}`;
}

/** Los parámetros de la página (siempre los internos, en inglés): qué ranking es, o `null`. */
export function parseBoardParams(input: string, period: string): { input: InputType; period: VisiblePeriod } | null {
  const parsedInput = INPUT_TYPES.find((option) => option === input);
  const parsedPeriod = VISIBLE_PERIODS.find((option) => PERIOD_SEGMENTS[option] === period);
  return parsedInput && parsedPeriod ? { input: parsedInput, period: parsedPeriod } : null;
}
