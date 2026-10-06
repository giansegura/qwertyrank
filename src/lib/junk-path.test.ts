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

  it("rankings en forma interna con segmentos que no existen", () => {
    expect(isJunkPath("/es/leaderboard/nada/today")).toBe(true);
    expect(isJunkPath("/en/leaderboard/physical/ayer")).toBe(true);
    expect(isJunkPath("/en/leaderboard/physical/today")).toBe(false);
  });

  it("el resto de URLs no se toca", () => {
    for (const path of ["/en", "/es/ranking/fisico/hoy", "/en/practice", "/xx/u/a", "/en/u"]) {
      expect(isJunkPath(path)).toBe(false);
    }
  });
});
