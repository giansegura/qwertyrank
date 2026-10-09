/**
 * The guides (spec 5c §2). Each one is a fixed route in `src/i18n/routing.ts` with its slug in every locale,
 * so next-intl translates, switches locale and redirects by itself. Internally the id is English.
 */
export const GUIDE_IDS = [
  "average-typing-speed",
  "how-to-type-faster",
  "wpm-vs-cpm",
  "finger-placement",
  "physical-vs-touch-keyboard",
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];

export type GuideHref = `/guides/${GuideId}`;

/** Publication date of every guide, and last update until one changes (Article JSON-LD). */
export const GUIDES_PUBLISHED = "2026-10-09";

/** Route of a guide for `Link`, `getPathname` or the SEO helpers. */
export function guideHref(id: GuideId): GuideHref {
  return `/guides/${id}`;
}

/** The page param (always the internal id): which guide it is, or `null`. */
export function parseGuideId(value: string): GuideId | null {
  return GUIDE_IDS.find((id) => id === value) ?? null;
}
