import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { GUIDE_IDS, guideHref } from "@/lib/guides";
import { localizedPath, type SeoHref } from "@/lib/seo/metadata";
import { SITE_URL } from "@/lib/site";

/** Sitemap pages (spec 5b §4, 5c §5): the legal ones are left out. */
const PAGES: SeoHref[] = [
  "/",
  "/practice",
  "/leaderboard/physical",
  "/leaderboard/touch",
  "/guides",
  ...GUIDE_IDS.map(guideHref),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((href) => {
    const languages = Object.fromEntries(
      routing.locales.map((locale) => [locale, `${SITE_URL}${localizedPath(locale, href)}`]),
    );
    return routing.locales.map((locale) => ({ url: languages[locale], alternates: { languages } }));
  });
}
