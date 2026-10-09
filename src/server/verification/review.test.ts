// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../db/client";
import { decideReview, exceedsVerifiedLevel, shouldReview, type ReviewCandidate, type Standing } from "./review";

const SCORE = 1_000;
const standing = (ahead: number, ownScore: number | null = null, verifiedWpm: number | null = null): Standing => ({
  ahead,
  ownScore,
  verifiedWpm,
});

describe("verified level", () => {
  it("without a level any WPM counts; with a level, only above 110%", () => {
    expect(exceedsVerifiedLevel(30, null)).toBe(true);
    expect(exceedsVerifiedLevel(110, 100)).toBe(false);
    expect(exceedsVerifiedLevel(110.01, 100)).toBe(true);
    expect(exceedsVerifiedLevel(66, 60)).toBe(false);
  });
});

describe("review decision", () => {
  it("goes into review if it would be in the top 10 of its ranking", () => {
    expect(shouldReview(SCORE, 80, standing(9))).toBe(true);
    expect(shouldReview(SCORE, 80, standing(10))).toBe(false);
  });

  it("only if it improves their own best", () => {
    expect(shouldReview(SCORE, 80, standing(0, SCORE + 1))).toBe(false);
    expect(shouldReview(SCORE, 80, standing(0, SCORE))).toBe(false);
    expect(shouldReview(SCORE, 80, standing(3, SCORE - 1))).toBe(true);
  });

  it("with a verified level, within 110% it is not verified even if it comes first", () => {
    expect(shouldReview(SCORE, 105, standing(0, null, 100))).toBe(false);
    expect(shouldReview(SCORE, 111, standing(0, null, 100))).toBe(true);
  });

  it("without an account, not valid or below 90% accuracy it queries nothing", async () => {
    const untouchable = new Proxy({}, {
      get() {
        throw new Error("should not query the database");
      },
    }) as DbExecutor;
    const game: ReviewCandidate = {
      userId: "u1",
      language: "en",
      inputType: "physical",
      verdict: "valid",
      wpm: 200,
      accuracy: 99,
      startsAt: new Date(),
    };
    expect(await decideReview(untouchable, { ...game, userId: null })).toBeNull();
    expect(await decideReview(untouchable, { ...game, verdict: "rejected" })).toBeNull();
    expect(await decideReview(untouchable, { ...game, accuracy: 89.99 })).toBeNull();
  });
});
