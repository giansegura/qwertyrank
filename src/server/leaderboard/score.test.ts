import { describe, expect, it } from "vitest";
import { encodeScore } from "./score";

const AT = new Date("2026-10-04T12:00:00Z");
const LATER = new Date("2026-10-04T12:05:00Z");

describe("composite score (spec §5.4)", () => {
  it("wpm comes first, then accuracy and then whoever came first", () => {
    expect(encodeScore({ wpm: 80, accuracy: 95, achievedAt: LATER })).toBeGreaterThan(
      encodeScore({ wpm: 79.99, accuracy: 100, achievedAt: AT }),
    );
    expect(encodeScore({ wpm: 80, accuracy: 96, achievedAt: LATER })).toBeGreaterThan(
      encodeScore({ wpm: 80, accuracy: 95.9, achievedAt: AT }),
    );
    expect(encodeScore({ wpm: 80, accuracy: 96, achievedAt: AT })).toBeGreaterThan(
      encodeScore({ wpm: 80, accuracy: 96, achievedAt: LATER }),
    );
  });

  it("wpm that round equally to the hundredth tie and the time decides", () => {
    expect(encodeScore({ wpm: 80.004, accuracy: 96, achievedAt: AT })).toBeGreaterThan(
      encodeScore({ wpm: 80.001, accuracy: 96, achievedAt: LATER }),
    );
  });

  it("is an exact integer even at the maximum", () => {
    const max = encodeScore({ wpm: 400, accuracy: 100, achievedAt: new Date("2026-01-01T00:00:00Z") });
    expect(Number.isSafeInteger(max)).toBe(true);
  });
});
