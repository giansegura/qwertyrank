import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";
import { SITE_NAME } from "@/lib/site";

/** Las rutas internas con página indexable (spec 5b §3.1). */
export type SeoHref = "/" | "/practice" | "/leaderboard/physical" | "/leaderboard/touch" | "/privacy" | "/terms";

/** Tamaño de las imágenes al compartir: la de cada página y la de cada partida. */
const IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Locale de Open Graph de cada idioma de la web. */
const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_ES", pt: "pt_BR" };

/** URL de una página en un idioma, relativa a `metadataBase` (`/es/practica`). */
export function localizedPath(locale: Locale, href: SeoHref): string {
  return getPathname({ locale, href });
}

/**
 * Canonical y alternativas de idioma de una página (spec 5b §3). `x-default` es `/` en la portada (la raíz
 * redirige al idioma de cada visitante) y la versión inglesa en las demás.
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
  /** Sin la marca: la añade la plantilla del layout. En la portada va el título completo (`absolute`). */
  title: string;
  description?: string;
}

/**
 * Imagen por defecto al compartir (`src/app/[locale]/opengraph-image.tsx`, spec 5b §6). Hay que nombrarla: si
 * una página define `openGraph`, Next deja de añadir la imagen del archivo.
 */
function defaultImage(locale: Locale) {
  return { url: `/${locale}/opengraph-image`, ...IMAGE_SIZE, alt: SITE_NAME, type: "image/png" };
}

/** Imagen de una partida (`src/app/[locale]/r/[id]/opengraph-image.tsx`, spec 5d §4). */
export function resultImage(locale: Locale, id: string, alt: string) {
  return { url: `/${locale}/r/${id}/opengraph-image`, ...IMAGE_SIZE, alt, type: "image/png" };
}

/**
 * Metadatos de una página indexable. Next no fusiona `openGraph` entre layout y página (lo sustituye), así
 * que se repiten aquí los campos comunes y la imagen. Sin descripción no se declara la clave: con `undefined`,
 * Next borraría la del layout en vez de heredarla.
 */
export function pageMetadata({ locale, href, title, description }: PageMetadataInput): Metadata {
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
      type: "website",
      images: [defaultImage(locale)],
    },
    twitter: { card: "summary_large_image", title: fullTitle, ...described, images: [defaultImage(locale)] },
  };
}

interface ResultMetadataInput {
  locale: Locale;
  id: string;
  /** Sin la marca: la añade la plantilla del layout. */
  title: string;
  description: string;
  imageAlt: string;
}

/**
 * Metadatos de una página de resultado (spec 5d §3.3): sin indexar, así que sin canonical ni idiomas, y con
 * la imagen de la partida nombrada a mano (la página define `openGraph`).
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
