import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lista portada, práctica y los dos rankings en cada idioma, con sus alternativas", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(12);
    expect(entries.map((entry) => entry.url)).toContain("https://qwertyrank.com/es/ranking/fisico");
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/qwertyrank\.com\/(en|es|pt)/);
      expect(Object.keys(entry.alternates?.languages ?? {})).toEqual(["en", "es", "pt"]);
    }
    const practice = entries.find((entry) => entry.url === "https://qwertyrank.com/pt/pratica");
    expect(practice?.alternates?.languages).toEqual({
      en: "https://qwertyrank.com/en/practice",
      es: "https://qwertyrank.com/es/practica",
      pt: "https://qwertyrank.com/pt/pratica",
    });
  });
});
