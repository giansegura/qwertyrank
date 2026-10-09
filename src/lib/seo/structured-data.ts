import type { Locale } from "@/i18n/routing";
import { type GuideHref, GUIDES_PUBLISHED } from "@/lib/guides";
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

/**
 * Breadcrumbs of a page: QwertyRank › {name}, or QwertyRank › {parent} › {name} for a page under a section
 * (a guide under the guides index, spec 5c §5).
 */
export function breadcrumbStructuredData(
  locale: Locale,
  href: SeoHref,
  name: string,
  parent?: { href: SeoHref; name: string },
): StructuredData {
  const crumbs = [
    { name: SITE_NAME, href: "/" as SeoHref },
    ...(parent ? [parent] : []),
    { name, href },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absolute(localizedPath(locale, crumb.href)),
    })),
  };
}

interface ArticleInput {
  locale: Locale;
  href: GuideHref;
  title: string;
  description: string;
}

/** A guide (spec 5c §5): an Article written and published by QwertyRank, with the default share image. */
export function articleStructuredData({ locale, href, title, description }: ArticleInput): StructuredData {
  const organization = { "@type": "Organization", name: SITE_NAME, url: SITE_URL };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: locale,
    datePublished: GUIDES_PUBLISHED,
    dateModified: GUIDES_PUBLISHED,
    mainEntityOfPage: absolute(localizedPath(locale, href)),
    image: absolute(`/${locale}/opengraph-image`),
    author: organization,
    publisher: organization,
  };
}

/** JSON for a `<script type="application/ld+json">`: `<` escaped so that no text closes the tag. */
export function serializeJsonLd(data: StructuredData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
