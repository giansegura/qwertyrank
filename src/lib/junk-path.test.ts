import { describe, expect, it } from "vitest";
import { isJunkPath } from "./junk-path";

describe("URLs imposibles", () => {
  it("perfiles con un nick de formato imposible", () => {
    expect(isJunkPath("/es/u/a")).toBe(true);
    expect(isJunkPath("/en/u/con%20espacio")).toBe(true);
    expect(isJunkPath("/en/u/%E0%A4%A")).toBe(true);
    expect(isJunkPath("/pt/u/gian_42")).toBe(false);
    expect(isJunkPath("/pt/u/gian_42/")).toBe(false);
  });

  it("rankings en forma interna con un teclado que no existe", () => {
    expect(isJunkPath("/es/leaderboard/nada")).toBe(true);
    expect(isJunkPath("/en/leaderboard/fisico/")).toBe(true);
    expect(isJunkPath("/en/leaderboard/physical")).toBe(false);
    expect(isJunkPath("/pt/leaderboard/touch/")).toBe(false);
  });

  it("el resto de URLs no se toca, también las antiguas con periodo (no existe su ruta: 404 normal)", () => {
    for (const path of ["/en", "/es/ranking/fisico", "/en/leaderboard/physical/today", "/en/practice", "/xx/u/a", "/en/u"]) {
      expect(isJunkPath(path)).toBe(false);
    }
  });
});
