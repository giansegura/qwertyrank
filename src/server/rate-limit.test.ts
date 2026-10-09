// @vitest-environment node
import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./rate-limit";

const HOUR = 3_600_000;

describe("retryAfterMs", () => {
  it("with the current window full, waits for the next one and for the current one to weigh less", () => {
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 3, 0, 1_000)).toBe(HOUR - 1_000 + 1);
    // 4 > 3: in the next window it has to wait for 4 · (1 − e/W) to drop below 3, i.e. e > W/4.
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 4, 0, 0)).toBe(HOUR + HOUR / 4 + 1);
  });

  it("if the previous window is what weighs, waits for it to weigh less", () => {
    // 1 + 4 · (1 − e/W) < 3 ⇔ e > W/2.
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 1, 4, 0)).toBe(HOUR / 2 + 1);
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 1, 4, HOUR / 2 - 10)).toBe(11);
  });
});
