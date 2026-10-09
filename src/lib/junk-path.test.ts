import { describe, expect, it } from "vitest";
import { isJunkPath } from "./junk-path";

describe("impossible URLs", () => {
  it("profiles with a nick in an impossible format", () => {
    expect(isJunkPath("/es/u/a")).toBe(true);
    expect(isJunkPath("/en/u/with%20space")).toBe(true);
    expect(isJunkPath("/en/u/%E0%A4%A")).toBe(true);
    expect(isJunkPath("/pt/u/gian_42")).toBe(false);
    expect(isJunkPath("/pt/u/gian_42/")).toBe(false);
  });

  it("rankings in internal form with a keyboard that does not exist", () => {
    expect(isJunkPath("/es/leaderboard/nada")).toBe(true);
    expect(isJunkPath("/en/leaderboard/fisico/")).toBe(true);
    expect(isJunkPath("/en/leaderboard/physical")).toBe(false);
    expect(isJunkPath("/pt/leaderboard/touch/")).toBe(false);
  });

  it("other URLs are left alone, including the old ones with a period (their route does not exist: normal 404)", () => {
    for (const path of ["/en", "/es/ranking/fisico", "/en/leaderboard/physical/today", "/en/practice", "/xx/u/a", "/en/u"]) {
      expect(isJunkPath(path)).toBe(false);
    }
  });
});
