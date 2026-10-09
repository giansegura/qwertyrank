import { describe, expect, it } from "vitest";
import { hoursLeft, requiredWpm } from "./verification";

describe("requiredWpm", () => {
  it("is 85 % of the record, rounded up to one decimal", () => {
    expect(requiredWpm(100)).toBe(85);
    expect(requiredWpm(61.5)).toBe(52.3);
    expect(requiredWpm(85.88)).toBe(73);
  });

  it("does not go up one decimal because of a floating-point error", () => {
    // 70 × 0.85 = 59.5 exactly; 72.4 × 0.85 gives 61.540000000000006 in floating point.
    expect(requiredWpm(70)).toBe(59.5);
    expect(requiredWpm(72.4)).toBe(61.6);
    expect(requiredWpm(120)).toBe(102);
  });
});

describe("hoursLeft", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");

  it("rounds up and never goes below 1", () => {
    expect(hoursLeft("2026-10-08T10:00:00.000Z", now)).toBe(24);
    expect(hoursLeft("2026-10-07T11:00:01.000Z", now)).toBe(2);
    expect(hoursLeft("2026-10-07T10:00:30.000Z", now)).toBe(1);
  });

  it("never goes above 24, even if the server clock is slightly ahead", () => {
    expect(hoursLeft("2026-10-08T10:00:00.040Z", now)).toBe(24);
  });
});
