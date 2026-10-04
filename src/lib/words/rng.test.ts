import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";

describe("mulberry32", () => {
  it("es determinista para una misma semilla", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("devuelve valores en [0, 1)", () => {
    const random = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
