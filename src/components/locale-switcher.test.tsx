import { describe, expect, it } from "vitest";
import { localizedHref } from "./locale-switcher";

describe("localizedHref", () => {
  it("las rutas fijas, rankings incluidos, se quedan igual: las traduce next-intl", () => {
    expect(localizedHref("/practice", {})).toBe("/practice");
    expect(localizedHref("/leaderboard/touch/all-time", {})).toBe("/leaderboard/touch/all-time");
  });

  it("el perfil y guardar conservan su parámetro", () => {
    expect(localizedHref("/u/[nick]", { nick: "gian_42" })).toEqual({ pathname: "/u/[nick]", params: { nick: "gian_42" } });
    expect(localizedHref("/save/[gameId]", { gameId: "g1" })).toEqual({ pathname: "/save/[gameId]", params: { gameId: "g1" } });
  });
});
