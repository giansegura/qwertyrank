// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isLiveBoard } from "./live";

describe("rankings vivos", () => {
  it("el de día vive 8 días desde que empieza; el de semana, 6 semanas", () => {
    const thursday = new Date("2026-10-01T23:00:00Z");
    expect(isLiveBoard("day", thursday, new Date("2026-10-08T23:59:59Z"))).toBe(true);
    expect(isLiveBoard("day", thursday, new Date("2026-10-09T00:00:00Z"))).toBe(false);
    // La semana ISO 40 de 2026 empieza el lunes 28 de septiembre: vive hasta el 9 de noviembre.
    expect(isLiveBoard("week", thursday, new Date("2026-11-08T23:59:59Z"))).toBe(true);
    expect(isLiveBoard("week", thursday, new Date("2026-11-09T00:00:00Z"))).toBe(false);
  });

  it("mes, año y siempre no caducan", () => {
    const old = new Date("2020-01-01T00:00:00Z");
    for (const period of ["month", "year", "all"] as const) {
      expect(isLiveBoard(period, old, new Date("2026-10-07T00:00:00Z"))).toBe(true);
    }
  });
});
