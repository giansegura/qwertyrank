// @vitest-environment node
import { describe, expect, it } from "vitest";
import { afterFailure, passesVerification } from "./finish";

const GOOD = { verdict: "valid" as const, accuracy: 95, inputType: "physical" as const, wpm: 85 };
const TARGET = { inputType: "physical" as const, targetWpm: 100 };

describe("resultado de la verificación", () => {
  it("se supera llegando al 85 % de las PPM del récord", () => {
    expect(passesVerification(GOOD, TARGET)).toBe(true);
    expect(passesVerification({ ...GOOD, wpm: 84.99 }, TARGET)).toBe(false);
    // 72,4 × 0,85 = 61,54 → hacen falta 61,6.
    expect(passesVerification({ ...GOOD, wpm: 61.59 }, { ...TARGET, targetWpm: 72.4 })).toBe(false);
    expect(passesVerification({ ...GOOD, wpm: 61.6 }, { ...TARGET, targetWpm: 72.4 })).toBe(true);
  });

  it("hace falta una partida válida, con al menos un 90 % de precisión y el mismo teclado", () => {
    expect(passesVerification({ ...GOOD, verdict: "rejected" }, TARGET)).toBe(false);
    expect(passesVerification({ ...GOOD, accuracy: 89.99 }, TARGET)).toBe(false);
    expect(passesVerification({ ...GOOD, accuracy: 90 }, TARGET)).toBe(true);
    expect(passesVerification({ ...GOOD, inputType: "touch" }, TARGET)).toBe(false);
  });

  it("un intento fallido deja los que quedan; el tercero la cierra", () => {
    expect(afterFailure(1, 1)).toEqual({ close: false, attemptsLeft: 2 });
    expect(afterFailure(2, 2)).toEqual({ close: false, attemptsLeft: 1 });
    expect(afterFailure(3, 3)).toEqual({ close: true, attemptsLeft: 0 });
    // El primer intento termina cuando otro dispositivo ya ha gastado el tercero: no se cierra.
    expect(afterFailure(1, 3)).toEqual({ close: false, attemptsLeft: 0 });
  });
});
