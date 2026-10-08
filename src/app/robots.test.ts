import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("no bloquea nada y declara el sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://qwertyrank.com/sitemap.xml",
    });
  });
});
