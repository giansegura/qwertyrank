import { describe, expect, it } from "vitest";
import { encodeScore } from "./score";

const AT = new Date("2026-10-04T12:00:00Z");
const LATER = new Date("2026-10-04T12:05:00Z");

describe("puntuación compuesta (spec §5.4)", () => {
  it("manda la PPM, luego la precisión y luego quien llegó antes", () => {
    expect(encodeScore({ wpm: 80, accuracy: 95, achievedAt: LATER })).toBeGreaterThan(
      encodeScore({ wpm: 79.99, accuracy: 100, achievedAt: AT }),
    );
    expect(encodeScore({ wpm: 80, accuracy: 96, achievedAt: LATER })).toBeGreaterThan(
      encodeScore({ wpm: 80, accuracy: 95.9, achievedAt: AT }),
    );
    expect(encodeScore({ wpm: 80, accuracy: 96, achievedAt: AT })).toBeGreaterThan(
      encodeScore({ wpm: 80, accuracy: 96, achievedAt: LATER }),
    );
  });

  it("PPM que redondean igual a la centésima empatan y decide la hora", () => {
    expect(encodeScore({ wpm: 80.004, accuracy: 96, achievedAt: AT })).toBeGreaterThan(
      encodeScore({ wpm: 80.001, accuracy: 96, achievedAt: LATER }),
    );
  });

  it("es un entero exacto incluso en el máximo", () => {
    const max = encodeScore({ wpm: 400, accuracy: 100, achievedAt: new Date("2026-01-01T00:00:00Z") });
    expect(Number.isSafeInteger(max)).toBe(true);
  });
});
