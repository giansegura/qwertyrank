import type { Locale } from "@/i18n/routing";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { localizedPath, type SeoHref } from "./metadata";

/** Objeto JSON-LD listo para `JsonLd`. */
export type StructuredData = Record<string, unknown>;

const absolute = (path: string) => `${SITE_URL}${path}`;

/** Portada (spec 5b §5): la web, quién la hace y la aplicación del test, en un solo `@graph`. */
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

/** Migas de una página que cuelga de la portada: QwertyRank › {name}. */
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

/** JSON para un `<script type="application/ld+json">`: `<` escapado para que ningún texto cierre la etiqueta. */
export function serializeJsonLd(data: StructuredData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
