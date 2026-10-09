import { describe, expect, it } from "vitest";
import { alternatesFor, pageMetadata, resultMetadata } from "./metadata";

describe("alternatesFor", () => {
  it("la portada apunta x-default a la raíz", () => {
    expect(alternatesFor("es", "/")).toEqual({
      canonical: "/es",
      languages: { en: "/en", es: "/es", pt: "/pt", "x-default": "/" },
    });
  });

  it("traduce la ruta en cada idioma y usa la inglesa como x-default", () => {
    expect(alternatesFor("pt", "/practice")).toEqual({
      canonical: "/pt/pratica",
      languages: { en: "/en/practice", es: "/es/practica", pt: "/pt/pratica", "x-default": "/en/practice" },
    });
    expect(alternatesFor("es", "/leaderboard/touch")).toEqual({
      canonical: "/es/ranking/tactil",
      languages: {
        en: "/en/leaderboard/touch",
        es: "/es/ranking/tactil",
        pt: "/pt/ranking/tatil",
        "x-default": "/en/leaderboard/touch",
      },
    });
  });
});

describe("pageMetadata", () => {
  it("repite título, descripción y URL canónica en Open Graph y Twitter", () => {
    const meta = pageMetadata({ locale: "es", href: "/practice", title: "Práctica", description: "Desc" });
    expect(meta.title).toBe("Práctica");
    expect(meta.openGraph).toMatchObject({
      title: "Práctica · QwertyRank",
      description: "Desc",
      url: "/es/practica",
      siteName: "QwertyRank",
      locale: "es_ES",
      type: "website",
      images: [{ url: "/es/opengraph-image", width: 1200, height: 630, alt: "QwertyRank", type: "image/png" }],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Práctica · QwertyRank",
      images: [{ url: "/es/opengraph-image" }],
    });
  });

  it("sin descripción no pisa la del layout: no declara la clave", () => {
    const meta = pageMetadata({ locale: "es", href: "/privacy", title: "Política de privacidad" });
    expect("description" in meta).toBe(false);
    expect("description" in (meta.openGraph ?? {})).toBe(false);
    expect("description" in (meta.twitter ?? {})).toBe(false);
  });

  it("en la portada el título es absoluto, sin la plantilla", () => {
    const meta = pageMetadata({ locale: "pt", href: "/", title: "QwertyRank — Teste", description: "D" });
    expect(meta.title).toEqual({ absolute: "QwertyRank — Teste" });
    expect(meta.openGraph).toMatchObject({ title: "QwertyRank — Teste", url: "/pt", locale: "pt_BR" });
  });
});

describe("resultMetadata", () => {
  it("sin indexar, con la imagen de la partida y la URL de su página", () => {
    const metadata = resultMetadata({
      locale: "es",
      id: "g1",
      title: "Gian: 82 ppm en español",
      description: "97 % de precisión…",
      imageAlt: "82 ppm · 97 %",
    });
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.title).toBe("Gian: 82 ppm en español");
    const image = { url: "/es/r/g1/opengraph-image", width: 1200, height: 630, alt: "82 ppm · 97 %", type: "image/png" };
    expect(metadata.openGraph).toMatchObject({
      title: "Gian: 82 ppm en español · QwertyRank",
      description: "97 % de precisión…",
      url: "/es/r/g1",
      locale: "es_ES",
      images: [image],
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [image] });
  });
});
