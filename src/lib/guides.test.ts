import { describe, expect, it } from "vitest";
import { GUIDE_IDS, guideHref, parseGuideId } from "./guides";

describe("guides registry", () => {
  it("has the five guides of spec 5c §2", () => {
    expect(GUIDE_IDS).toEqual([
      "average-typing-speed",
      "how-to-type-faster",
      "wpm-vs-cpm",
      "finger-placement",
      "physical-vs-touch-keyboard",
    ]);
  });

  it("builds the internal href and parses the page param", () => {
    expect(guideHref("wpm-vs-cpm")).toBe("/guides/wpm-vs-cpm");
    expect(parseGuideId("finger-placement")).toBe("finger-placement");
    expect(parseGuideId("nope")).toBeNull();
  });
});
