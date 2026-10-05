import { describe, expect, it } from "vitest";
import { eventTime } from "./event-time";

describe("eventTime", () => {
  it("usa la hora del evento si está en la escala de performance.now()", () => {
    expect(eventTime(990, 1_000)).toBe(990);
  });

  it("usa la hora actual si el evento viene en otra escala (época Unix) o no tiene hora", () => {
    expect(eventTime(1_790_000_000_000, 1_000)).toBe(1_000);
    expect(eventTime(0, 1_000)).toBe(1_000);
  });

  it("usa la hora actual si el evento parece del futuro o de hace más de un segundo", () => {
    expect(eventTime(1_500, 1_000)).toBe(1_000);
    expect(eventTime(10, 5_000)).toBe(5_000);
  });
});
