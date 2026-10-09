import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("blocks nothing and declares the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://qwertyrank.com/sitemap.xml",
    });
  });
});
