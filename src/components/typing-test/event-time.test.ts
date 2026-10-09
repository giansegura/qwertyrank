import { describe, expect, it } from "vitest";
import { eventTime } from "./event-time";

describe("eventTime", () => {
  it("uses the event time if it is on the performance.now() scale", () => {
    expect(eventTime(990, 1_000)).toBe(990);
  });

  it("uses the current time if the event is on another scale (Unix epoch) or has no time", () => {
    expect(eventTime(1_790_000_000_000, 1_000)).toBe(1_000);
    expect(eventTime(0, 1_000)).toBe(1_000);
  });

  it("uses the current time if the event seems to be from the future or more than a second ago", () => {
    expect(eventTime(1_500, 1_000)).toBe(1_000);
    expect(eventTime(10, 5_000)).toBe(5_000);
  });
});
