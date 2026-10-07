import { describe, expect, it } from "vitest";
import { hoursLeft, requiredWpm } from "./verification";

describe("requiredWpm", () => {
  it("es el 85 % del récord, redondeado hacia arriba a una décima", () => {
    expect(requiredWpm(100)).toBe(85);
    expect(requiredWpm(61.5)).toBe(52.3);
    expect(requiredWpm(85.88)).toBe(73);
  });

  it("no sube una décima por un error de coma flotante", () => {
    // 70 × 0,85 = 59,5 exacto; 72,4 × 0,85 da 61,540000000000006 en coma flotante.
    expect(requiredWpm(70)).toBe(59.5);
    expect(requiredWpm(72.4)).toBe(61.6);
    expect(requiredWpm(120)).toBe(102);
  });
});

describe("hoursLeft", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");

  it("redondea hacia arriba y nunca baja de 1", () => {
    expect(hoursLeft("2026-10-08T10:00:00.000Z", now)).toBe(24);
    expect(hoursLeft("2026-10-07T11:00:01.000Z", now)).toBe(2);
    expect(hoursLeft("2026-10-07T10:00:30.000Z", now)).toBe(1);
  });

  it("nunca pasa de 24, aunque el reloj del servidor vaya un poco por delante", () => {
    expect(hoursLeft("2026-10-08T10:00:00.040Z", now)).toBe(24);
  });
});
