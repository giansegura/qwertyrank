import { describe, expect, it } from "vitest";
import { localizedHref } from "./locale-switcher";

describe("localizedHref", () => {
  it("fixed routes, rankings included, stay the same: next-intl translates them", () => {
    expect(localizedHref("/practice", {})).toBe("/practice");
    expect(localizedHref("/leaderboard/touch", {})).toBe("/leaderboard/touch");
  });

  it("profile, save and result keep their parameter", () => {
    expect(localizedHref("/u/[nick]", { nick: "gian_42" })).toEqual({ pathname: "/u/[nick]", params: { nick: "gian_42" } });
    expect(localizedHref("/save/[gameId]", { gameId: "g1" })).toEqual({ pathname: "/save/[gameId]", params: { gameId: "g1" } });
    expect(localizedHref("/r/[id]", { id: "g1" })).toEqual({ pathname: "/r/[id]", params: { id: "g1" } });
  });
});
