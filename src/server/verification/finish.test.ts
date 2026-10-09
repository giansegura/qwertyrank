// @vitest-environment node
import { describe, expect, it } from "vitest";
import { afterFailure, passesVerification } from "./finish";

const GOOD = { verdict: "valid" as const, accuracy: 95, inputType: "physical" as const, wpm: 85 };
const TARGET = { inputType: "physical" as const, targetWpm: 100 };

describe("verification result", () => {
  it("is passed by reaching 85% of the record's WPM", () => {
    expect(passesVerification(GOOD, TARGET)).toBe(true);
    expect(passesVerification({ ...GOOD, wpm: 84.99 }, TARGET)).toBe(false);
    // 72.4 × 0.85 = 61.54 → 61.6 is needed.
    expect(passesVerification({ ...GOOD, wpm: 61.59 }, { ...TARGET, targetWpm: 72.4 })).toBe(false);
    expect(passesVerification({ ...GOOD, wpm: 61.6 }, { ...TARGET, targetWpm: 72.4 })).toBe(true);
  });

  it("needs a valid game, with at least 90% accuracy and the same keyboard", () => {
    expect(passesVerification({ ...GOOD, verdict: "rejected" }, TARGET)).toBe(false);
    expect(passesVerification({ ...GOOD, accuracy: 89.99 }, TARGET)).toBe(false);
    expect(passesVerification({ ...GOOD, accuracy: 90 }, TARGET)).toBe(true);
    expect(passesVerification({ ...GOOD, inputType: "touch" }, TARGET)).toBe(false);
  });

  it("a failed attempt leaves the remaining ones; the third closes it", () => {
    expect(afterFailure(1, 1)).toEqual({ close: false, attemptsLeft: 2 });
    expect(afterFailure(2, 2)).toEqual({ close: false, attemptsLeft: 1 });
    expect(afterFailure(3, 3)).toEqual({ close: true, attemptsLeft: 0 });
    // The first attempt finishes when another device has already spent the third: it is not closed.
    expect(afterFailure(1, 3)).toEqual({ close: false, attemptsLeft: 0 });
  });
});
