import { describe, expect, it } from "vitest";
import { getPathname } from "@/i18n/navigation";
import { leaderboardHref, parseInput } from "./slugs";

describe("rutas del ranking", () => {
  it("cada ranking es una ruta fija por teclado, con los valores internos en inglés", () => {
    expect(leaderboardHref("physical")).toBe("/leaderboard/physical");
    expect(leaderboardHref("touch")).toBe("/leaderboard/touch");
  });

  it("next-intl la traduce a cada idioma, valores incluidos (spec §7.1)", () => {
    expect(getPathname({ locale: "es", href: leaderboardHref("physical") })).toBe("/es/ranking/fisico");
    expect(getPathname({ locale: "es", href: leaderboardHref("touch") })).toBe("/es/ranking/tactil");
    expect(getPathname({ locale: "pt", href: leaderboardHref("touch") })).toBe("/pt/ranking/tatil");
    expect(getPathname({ locale: "en", href: leaderboardHref("touch") })).toBe("/en/leaderboard/touch");
  });

  it("el parámetro interno de la página se lee como teclado", () => {
    expect(parseInput("touch")).toBe("touch");
    expect(parseInput("physical")).toBe("physical");
  });

  it("valores desconocidos o de otro idioma no son un ranking", () => {
    expect(parseInput("fisico")).toBeNull();
    expect(parseInput("keyboard")).toBeNull();
    expect(parseInput("")).toBeNull();
  });
});
