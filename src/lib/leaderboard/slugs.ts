import type { InputType } from "@/lib/game/types";

/**
 * Each ranking (a keyboard, in the page's language) is a fixed route declared in `src/i18n/routing.ts`
 * with its URL in each language (`/es/ranking/fisico`, spec §7.1). That way next-intl translates, switches
 * language and redirects from another language's URL on its own. Internally, the values are in English.
 */

export const INPUT_TYPES = ["physical", "touch"] as const satisfies readonly InputType[];

export type LeaderboardPathname = `/leaderboard/${InputType}`;

/** Route of a ranking for `Link`, `getPathname` or `redirect`; prefixed with the language it is its cache key. */
export function leaderboardHref(input: InputType): LeaderboardPathname {
  return `/leaderboard/${input}`;
}

/** The page's parameter (always the internal one, in English): which keyboard it is, or `null`. */
export function parseInput(input: string): InputType | null {
  return INPUT_TYPES.find((option) => option === input) ?? null;
}
