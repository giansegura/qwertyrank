import { describe, expect, it } from "vitest";
import { applyInput, createEngine } from "./engine";
import { accuracyPercent, countCorrectChars, countTypedChars, round2, wordsPerMinute } from "./metrics";

const typed = (words: string[], text: string) => applyInput(createEngine(words), 0, text);

describe("metrics", () => {
  it("countCorrectChars suma palabras correctas con su espacio", () => {
    expect(countCorrectChars(typed(["hola", "mundo", "azul"], "hola mundo "))).toBe(11);
  });

  it("countCorrectChars no suma palabras confirmadas con errores", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mumdo "))).toBe(5);
  });

  it("countCorrectChars suma el prefijo correcto de la palabra activa", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mun"))).toBe(8);
  });

  it("countCorrectChars no suma la palabra activa si tiene un error", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mon"))).toBe(5);
  });

  it("countTypedChars cuenta todo lo escrito, incluidos errores", () => {
    expect(countTypedChars(typed(["hola", "mundo"], "hola mon"))).toBe(8);
  });

  it("wordsPerMinute usa palabras de 5 caracteres", () => {
    expect(wordsPerMinute(50, 30_000)).toBe(20);
    expect(wordsPerMinute(10, 0)).toBe(0);
  });

  it("accuracyPercent devuelve 0 sin pulsaciones y redondea a 2 decimales", () => {
    expect(accuracyPercent(0, 0)).toBe(0);
    expect(accuracyPercent(2, 3)).toBe(66.67);
  });

  it("round2 redondea a 2 decimales", () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(66.666)).toBe(66.67);
  });
});
