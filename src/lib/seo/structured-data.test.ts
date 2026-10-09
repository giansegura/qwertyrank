import { describe, expect, it } from "vitest";
import { articleStructuredData, breadcrumbStructuredData, homeStructuredData, serializeJsonLd } from "./structured-data";

describe("structured data", () => {
  it("the home page declares the website, the organization and the application", () => {
    const data = homeStructuredData("es", "Desc");
    const graph = data["@graph"] as Record<string, unknown>[];
    expect(graph.map((node) => node["@type"])).toEqual(["WebSite", "Organization", "WebApplication"]);
    expect(graph[2]).toMatchObject({
      url: "https://qwertyrank.com/es",
      description: "Desc",
      inLanguage: "es",
      applicationCategory: "EducationalApplication",
      offers: { price: "0", priceCurrency: "EUR" },
    });
  });

  it("the breadcrumbs link the home page and the page with translated absolute URLs", () => {
    expect(breadcrumbStructuredData("pt", "/leaderboard/touch", "Ranking")).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "QwertyRank", item: "https://qwertyrank.com/pt" },
        { "@type": "ListItem", position: 2, name: "Ranking", item: "https://qwertyrank.com/pt/ranking/tatil" },
      ],
    });
  });

  it("escapes < so that a text cannot close the script tag", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>" });
  });

  it("a guide's breadcrumbs go through the guides index", () => {
    const data = breadcrumbStructuredData("es", "/guides/wpm-vs-cpm", "PPM y CPM", { href: "/guides", name: "Guías" });
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "QwertyRank", item: "https://qwertyrank.com/es" },
      { "@type": "ListItem", position: 2, name: "Guías", item: "https://qwertyrank.com/es/guias" },
      { "@type": "ListItem", position: 3, name: "PPM y CPM", item: "https://qwertyrank.com/es/guias/ppm-y-cpm" },
    ]);
  });

  it("a guide is an Article published by QwertyRank, with absolute URLs", () => {
    expect(
      articleStructuredData({ locale: "pt", href: "/guides/finger-placement", title: "Posição dos dedos", description: "Desc" }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Posição dos dedos",
      description: "Desc",
      inLanguage: "pt",
      datePublished: "2026-10-09",
      dateModified: "2026-10-09",
      mainEntityOfPage: "https://qwertyrank.com/pt/guias/posicao-dos-dedos",
      image: "https://qwertyrank.com/pt/opengraph-image",
      author: { "@type": "Organization", name: "QwertyRank", url: "https://qwertyrank.com" },
      publisher: { "@type": "Organization", name: "QwertyRank", url: "https://qwertyrank.com" },
    });
  });
});
