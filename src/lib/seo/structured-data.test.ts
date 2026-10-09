import { describe, expect, it } from "vitest";
import { breadcrumbStructuredData, homeStructuredData, serializeJsonLd } from "./structured-data";

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
});
