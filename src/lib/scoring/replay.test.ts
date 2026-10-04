import { describe, expect, it } from "vitest";
import { replay } from "./replay";
import type { TypingEvent } from "./types";

const input = (t: number, inserted: string, deleted = 0): TypingEvent => ({
  t, type: "input", deleted, inserted, trusted: true,
});

describe("replay", () => {
  const words = ["hola", "mundo", "azul"];

  it("calcula PPM, PPM brutas y precisión al final de la partida", () => {
    const events = [input(0, "hola "), input(1000, "mumdo "), input(2000, "az")];
    const result = replay(words, events, 30_000);
    expect(result.correctChars).toBe(7);
    expect(result.typedChars).toBe(13);
    expect(result.wpm).toBe(2.8);
    expect(result.rawWpm).toBe(5.2);
    expect(result.accuracy).toBe(84.62);
    expect(result.mistakes).toEqual({ n: 1 });
  });

  it("ignora eventos de teclado y eventos fuera de la partida", () => {
    const events: TypingEvent[] = [
      { t: 0, type: "down", key: "h", code: "KeyH", trusted: true },
      input(-5, "xxx"),
      input(0, "hola "),
      input(15_001, "mundo "),
    ];
    const result = replay(words, events, 15_000);
    expect(result.correctChars).toBe(5);
  });

  it("ordena los eventos por tiempo antes de reproducirlos", () => {
    const result = replay(words, [input(500, "la "), input(100, "ho")], 15_000);
    expect(result.correctChars).toBe(5);
  });

  it("da una PPM por segundo, acumulada", () => {
    const events = [input(500, "hola "), input(1000, "mundo "), input(2500, "azul ")];
    const result = replay(words, events, 3000);
    expect(result.perSecond).toEqual([
      wpm(11, 1000),
      wpm(11, 2000),
      wpm(16, 3000),
    ]);
  });

  it("una partida sin pulsaciones da 0 en todo", () => {
    const result = replay(words, [], 15_000);
    expect(result).toMatchObject({ wpm: 0, rawWpm: 0, accuracy: 0, correctChars: 0 });
    expect(result.perSecond).toHaveLength(15);
  });
});

function wpm(chars: number, ms: number) {
  return Math.round((chars / 5 / (ms / 60_000)) * 100) / 100;
}
