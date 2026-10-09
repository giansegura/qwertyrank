import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import type { GuideHref } from "@/lib/guides";
import { type Locale, routing } from "@/i18n/routing";
import { SITE_NAME } from "@/lib/site";

/** The internal routes with an indexable page (spec 5b §3.1). */
export type SeoHref =
  | "/"
  | "/practice"
  | "/leaderboard/physical"
  | "/leaderboard/touch"
  | "/privacy"
  | "/terms"
  | "/guides"
  | GuideHref;

/** Size of the share images: each page's and each game's. */
const IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Open Graph locale for each language of the site. */
const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_ES", pt: "pt_BR" };

/** URL of a page in a language, relative to `metadataBase` (`/es/practica`). */
export function localizedPath(locale: Locale, href: SeoHref): string {
  return getPathname({ locale, href });
}

/**
 * Canonical and language alternates of a page (spec 5b §3). `x-default` is `/` on the home page (the root
 * redirects to each visitor's language) and the English version on the others.
 */
export function alternatesFor(locale: Locale, href: SeoHref) {
  const languages: Record<string, string> = {};
  for (const other of routing.locales) languages[other] = localizedPath(other, href);
  languages["x-default"] = href === "/" ? "/" : localizedPath("en", href);
  return { canonical: localizedPath(locale, href), languages };
}

interface PageMetadataInput {
  locale: Locale;
  href: SeoHref;
  /** Without the brand: the layout's template adds it. The home page gets the full title (`absolute`). */
  title: string;
  description?: string;
  /** `article` for a guide (spec 5c §5), matching its Article JSON-LD. */
  ogType?: "website" | "article";
}

/**
 * Default share image (`src/app/[locale]/opengraph-image.tsx`, spec 5b §6). It has to be named: if a page
 * defines `openGraph`, Next stops adding the file's image.
 */
function defaultImage(locale: Locale) {
  return { url: `/${locale}/opengraph-image`, ...IMAGE_SIZE, alt: SITE_NAME, type: "image/png" };
}

/** Image of a game (`src/app/[locale]/r/[id]/opengraph-image.tsx`, spec 5d §4). */
export function resultImage(locale: Locale, id: string, alt: string) {
  return { url: `/${locale}/r/${id}/opengraph-image`, ...IMAGE_SIZE, alt, type: "image/png" };
}

/**
 * Metadata of an indexable page. Next does not merge `openGraph` between layout and page (it replaces it), so
 * the common fields and the image are repeated here. Without a description the key is not declared: with
 * `undefined`, Next would erase the layout's instead of inheriting it.
 */
export function pageMetadata({ locale, href, title, description, ogType = "website" }: PageMetadataInput): Metadata {
  const alternates = alternatesFor(locale, href);
  const fullTitle = href === "/" ? title : `${title} · ${SITE_NAME}`;
  const described = description === undefined ? {} : { description };
  return {
    title: href === "/" ? { absolute: title } : title,
    ...described,
    alternates,
    openGraph: {
      title: fullTitle,
      ...described,
      url: alternates.canonical,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      type: ogType,
      images: [defaultImage(locale)],
    },
    twitter: { card: "summary_large_image", title: fullTitle, ...described, images: [defaultImage(locale)] },
  };
}

interface ResultMetadataInput {
  locale: Locale;
  id: string;
  /** Without the brand: the layout's template adds it. */
  title: string;
  description: string;
  imageAlt: string;
}

/**
 * Metadata of a result page (spec 5d §3.3): not indexed, so no canonical or languages, and with the game's
 * image named by hand (the page defines `openGraph`).
 */
export function resultMetadata({ locale, id, title, description, imageAlt }: ResultMetadataInput): Metadata {
  const fullTitle = `${title} · ${SITE_NAME}`;
  const image = resultImage(locale, id, imageAlt);
  return {
    title,
    description,
    robots: { index: false },
    openGraph: {
      title: fullTitle,
      description,
      url: getPathname({ locale, href: { pathname: "/r/[id]", params: { id } } }),
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] },
  };
}
