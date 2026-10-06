import { describe, expect, it } from "vitest";
import { periodEnd, periodKey, periodKeys } from "./periods";

describe("periodKey", () => {
  it("el día cambia a medianoche UTC", () => {
    expect(periodKey("day", new Date("2026-10-04T23:59:59.999Z"))).toBe("2026-10-04");
    expect(periodKey("day", new Date("2026-10-05T00:00:00.000Z"))).toBe("2026-10-05");
  });

  it("las semanas son ISO: empiezan en lunes", () => {
    expect(periodKey("week", new Date("2026-10-04T23:59:59Z"))).toBe("2026-W40");
    expect(periodKey("week", new Date("2026-10-05T00:00:00Z"))).toBe("2026-W41");
  });

  it("cambio de año: el 31-12-2026 y el 1-1-2027 son la semana 2026-W53", () => {
    expect(periodKey("week", new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
    expect(periodKey("week", new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(periodKey("week", new Date("2027-01-04T00:00:00Z"))).toBe("2027-W01");
    expect(periodKey("year", new Date("2027-01-01T00:00:00Z"))).toBe("2027");
  });

  it("las cinco claves de un momento", () => {
    expect(periodKeys(new Date("2026-10-04T12:00:00Z"))).toEqual({
      day: "2026-10-04",
      week: "2026-W40",
      month: "2026-10",
      year: "2026",
      all: "all",
    });
  });
});

describe("periodEnd", () => {
  it("cada periodo termina en la medianoche UTC que lo reinicia", () => {
    const sunday = new Date("2026-10-04T15:30:00Z");
    expect(periodEnd("day", sunday)?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodEnd("week", sunday)?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodEnd("week", new Date("2026-10-05T00:00:00Z"))?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(periodEnd("month", sunday)?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(periodEnd("month", new Date("2026-12-15T00:00:00Z"))?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(periodEnd("year", sunday)?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("siempre no termina", () => {
    expect(periodEnd("all", new Date())).toBeNull();
  });
});
