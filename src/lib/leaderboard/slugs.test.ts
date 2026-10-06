import { describe, expect, it } from "vitest";
import { getPathname } from "@/i18n/navigation";
import { leaderboardHref, parseBoardParams } from "./slugs";

describe("rutas del ranking", () => {
  it("cada ranking visible es una ruta fija, con los valores internos en inglés", () => {
    expect(leaderboardHref("physical", "day")).toBe("/leaderboard/physical/today");
    expect(leaderboardHref("touch", "all")).toBe("/leaderboard/touch/all-time");
  });

  it("next-intl la traduce a cada idioma, valores incluidos (spec §7.1)", () => {
    expect(getPathname({ locale: "es", href: leaderboardHref("physical", "day") })).toBe("/es/ranking/fisico/hoy");
    expect(getPathname({ locale: "es", href: leaderboardHref("touch", "all") })).toBe("/es/ranking/tactil/siempre");
    expect(getPathname({ locale: "pt", href: leaderboardHref("touch", "day") })).toBe("/pt/ranking/tatil/hoje");
    expect(getPathname({ locale: "en", href: leaderboardHref("touch", "week") })).toBe("/en/leaderboard/touch/week");
  });

  it("los parámetros internos de la página se leen como teclado y periodo", () => {
    expect(parseBoardParams("touch", "month")).toEqual({ input: "touch", period: "month" });
    expect(parseBoardParams("physical", "all-time")).toEqual({ input: "physical", period: "all" });
  });

  it("valores desconocidos, de otro idioma o del año (oculto) no son un ranking", () => {
    expect(parseBoardParams("fisico", "hoy")).toBeNull();
    expect(parseBoardParams("physical", "year")).toBeNull();
    expect(parseBoardParams("keyboard", "today")).toBeNull();
  });
});
