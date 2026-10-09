import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, countryOptions, flagEmoji, isCountryCode } from "./countries";

describe("countries", () => {
  it("are the 249 ISO 3166-1 alpha-2 codes, without repeats", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
  });

  it("only codes from the list are valid, in uppercase", () => {
    expect(isCountryCode("ES")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("es")).toBe(false);
  });

  it("the name comes in the page's language", () => {
    expect(countryName("ES", "es")).toBe("España");
    expect(countryName("BR", "pt")).toBe("Brasil");
    expect(countryName("GB", "en")).toBe("United Kingdom");
  });

  it("the flag is the country's emoji", () => {
    expect(flagEmoji("ES")).toBe("🇪🇸");
  });

  it("the selector options are sorted by name in the page's language", () => {
    const options = countryOptions("es");
    expect(options).toHaveLength(249);
    expect(options.find((option) => option.code === "ES")?.name).toBe("España");
    const names = options.map((option) => option.name);
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, "es")));
  });
});
