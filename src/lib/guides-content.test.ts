// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { localizedPath, type SeoHref } from "@/lib/seo/metadata";
import { GUIDE_IDS, guideHref } from "./guides";

/** Every indexable page a guide may link to. */
const PAGES: SeoHref[] = [
  "/",
  "/practice",
  "/leaderboard/physical",
  "/leaderboard/touch",
  "/privacy",
  "/terms",
  "/guides",
  ...GUIDE_IDS.map(guideHref),
];

const MIN_WORDS = 700;

/**
 * The internal links of a guide. Only plain inline links (`[text](/path)`) are allowed: anything else (a
 * title, a reference-style definition, an HTML `href`) is reported as unsupported, so it can't slip a broken
 * link past the check below.
 */
function guideLinks(text: string): { targets: string[]; unsupported: string[] } {
  const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  const unsupported = [
    ...[...text.matchAll(/\]\([^)]*\s[^)]*\)/g)].map((match) => match[0]),
    ...[...text.matchAll(/^\s*\[[^\]]+\]:\s*\S+/gm)].map((match) => match[0]),
    ...[...text.matchAll(/href\s*=/g)].map((match) => match[0]),
  ];
  return { targets, unsupported };
}

describe("guideLinks", () => {
  it("finds plain inline links", () => {
    expect(guideLinks("See [the test](/en) and [practice](/en/practice).")).toEqual({
      targets: ["/en", "/en/practice"],
      unsupported: [],
    });
  });

  it("reports links with a title, reference-style definitions and HTML hrefs", () => {
    const { unsupported } = guideLinks('[a](/es/bad "t")\n[b][r]\n[r]: /es/bad\n<a href="/es/bad">c</a>');
    expect(unsupported).toHaveLength(3);
  });
});

const file = (locale: string, id: string) => join(process.cwd(), "content", locale, `${id}.mdx`);

describe.each(routing.locales)("guides in %s", (locale) => {
  const allowed = new Set(PAGES.map((href) => localizedPath(locale, href)));

  it.each(GUIDE_IDS)("%s exists, has no H1 and is long enough", (id) => {
    expect(existsSync(file(locale, id))).toBe(true);
    const text = readFileSync(file(locale, id), "utf8");
    // The page renders the H1 from the messages (spec 5c §3).
    expect(text).not.toMatch(/^# /m);
    expect(text.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(MIN_WORDS);
  });

  it.each(GUIDE_IDS)("%s only links to real pages of its own locale", (id) => {
    const { targets, unsupported } = guideLinks(readFileSync(file(locale, id), "utf8"));
    expect(unsupported).toEqual([]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(allowed.has(target), `${locale}/${id}.mdx links to ${target}`).toBe(true);
    }
  });
});
