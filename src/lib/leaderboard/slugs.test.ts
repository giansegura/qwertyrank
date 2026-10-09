import { describe, expect, it } from "vitest";
import { getPathname } from "@/i18n/navigation";
import { leaderboardHref, parseInput } from "./slugs";

describe("ranking routes", () => {
  it("each ranking is a fixed route per keyboard, with the internal values in English", () => {
    expect(leaderboardHref("physical")).toBe("/leaderboard/physical");
    expect(leaderboardHref("touch")).toBe("/leaderboard/touch");
  });

  it("next-intl translates it to each language, values included (spec §7.1)", () => {
    expect(getPathname({ locale: "es", href: leaderboardHref("physical") })).toBe("/es/ranking/fisico");
    expect(getPathname({ locale: "es", href: leaderboardHref("touch") })).toBe("/es/ranking/tactil");
    expect(getPathname({ locale: "pt", href: leaderboardHref("touch") })).toBe("/pt/ranking/tatil");
    expect(getPathname({ locale: "en", href: leaderboardHref("touch") })).toBe("/en/leaderboard/touch");
  });

  it("the page's internal parameter is read as a keyboard", () => {
    expect(parseInput("touch")).toBe("touch");
    expect(parseInput("physical")).toBe("physical");
  });

  it("unknown values or values from another language are not a ranking", () => {
    expect(parseInput("fisico")).toBeNull();
    expect(parseInput("keyboard")).toBeNull();
    expect(parseInput("")).toBeNull();
  });
});
