// @vitest-environment node
import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./rate-limit";

const HOUR = 3_600_000;

describe("retryAfterMs", () => {
  it("con la ventana actual llena, espera a la siguiente y a que la de ahora pese menos", () => {
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 3, 0, 1_000)).toBe(HOUR - 1_000 + 1);
    // 4 > 3: en la ventana siguiente hay que esperar a que 4 · (1 − e/W) baje de 3, es decir e > W/4.
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 4, 0, 0)).toBe(HOUR + HOUR / 4 + 1);
  });

  it("si lo que pesa es la ventana anterior, espera a que pese menos", () => {
    // 1 + 4 · (1 − e/W) < 3 ⇔ e > W/2.
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 1, 4, 0)).toBe(HOUR / 2 + 1);
    expect(retryAfterMs({ max: 3, windowMs: HOUR }, 1, 4, HOUR / 2 - 10)).toBe(11);
  });
});
