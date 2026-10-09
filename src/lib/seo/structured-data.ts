import type { Locale } from "@/i18n/routing";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { localizedPath, type SeoHref } from "./metadata";

/** JSON-LD object ready for `JsonLd`. */
export type StructuredData = Record<string, unknown>;

const absolute = (path: string) => `${SITE_URL}${path}`;

/** Home page (spec 5b §5): the website, who makes it and the test application, in a single `@graph`. */
export function homeStructuredData(locale: Locale, description: string): StructuredData {
  const url = absolute(localizedPath(locale, "/"));
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: SITE_NAME, url: SITE_URL, inLanguage: locale },
      { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        url,
        description,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any",
        inLanguage: locale,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      },
    ],
  };
}

/** Breadcrumbs of a page that hangs from the home page: QwertyRank › {name}. */
export function breadcrumbStructuredData(locale: Locale, href: SeoHref, name: string): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: absolute(localizedPath(locale, "/")) },
      { "@type": "ListItem", position: 2, name, item: absolute(localizedPath(locale, href)) },
    ],
  };
}

/** JSON for a `<script type="application/ld+json">`: `<` escaped so that no text closes the tag. */
export function serializeJsonLd(data: StructuredData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
