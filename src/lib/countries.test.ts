import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, countryOptions, flagEmoji, isCountryCode } from "./countries";

describe("países", () => {
  it("son los 249 códigos ISO 3166-1 alfa-2, sin repetir", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
  });

  it("solo valen códigos de la lista, en mayúsculas", () => {
    expect(isCountryCode("ES")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("es")).toBe(false);
  });

  it("el nombre sale en el idioma de la página", () => {
    expect(countryName("ES", "es")).toBe("España");
    expect(countryName("BR", "pt")).toBe("Brasil");
    expect(countryName("GB", "en")).toBe("United Kingdom");
  });

  it("la bandera es el emoji del país", () => {
    expect(flagEmoji("ES")).toBe("🇪🇸");
  });

  it("las opciones del selector van ordenadas por nombre en el idioma de la página", () => {
    const options = countryOptions("es");
    expect(options).toHaveLength(249);
    expect(options.find((option) => option.code === "ES")?.name).toBe("España");
    const names = options.map((option) => option.name);
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, "es")));
  });
});
