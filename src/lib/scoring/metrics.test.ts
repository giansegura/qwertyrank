import { describe, expect, it } from "vitest";
import { applyInput, createEngine } from "./engine";
import { accuracyPercent, countCorrectChars, countTypedChars, round2, wordsPerMinute } from "./metrics";

const typed = (words: string[], text: string) => applyInput(createEngine(words), 0, text);

describe("metrics", () => {
  it("countCorrectChars adds correct words with their space", () => {
    expect(countCorrectChars(typed(["hola", "mundo", "azul"], "hola mundo "))).toBe(11);
  });

  it("countCorrectChars does not add committed words with errors", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mumdo "))).toBe(5);
  });

  it("countCorrectChars adds the correct prefix of the active word", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mun"))).toBe(8);
  });

  it("countCorrectChars does not add the active word if it has an error", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mon"))).toBe(5);
  });

  it("countTypedChars counts everything typed, errors included", () => {
    expect(countTypedChars(typed(["hola", "mundo"], "hola mon"))).toBe(8);
  });

  it("wordsPerMinute uses 5-character words", () => {
    expect(wordsPerMinute(50, 30_000)).toBe(20);
    expect(wordsPerMinute(10, 0)).toBe(0);
  });

  it("accuracyPercent returns 0 without keystrokes and rounds to 2 decimals", () => {
    expect(accuracyPercent(0, 0)).toBe(0);
    expect(accuracyPercent(2, 3)).toBe(66.67);
  });

  it("round2 rounds to 2 decimals", () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(66.666)).toBe(66.67);
  });
});
