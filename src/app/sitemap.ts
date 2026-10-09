import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { localizedPath, type SeoHref } from "@/lib/seo/metadata";
import { SITE_URL } from "@/lib/site";

/** Sitemap pages (spec 5b §4): the legal ones are left out; the guides will come with 5c. */
const PAGES: SeoHref[] = ["/", "/practice", "/leaderboard/physical", "/leaderboard/touch"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((href) => {
    const languages = Object.fromEntries(
      routing.locales.map((locale) => [locale, `${SITE_URL}${localizedPath(locale, href)}`]),
    );
    return routing.locales.map((locale) => ({ url: languages[locale], alternates: { languages } }));
  });
}
