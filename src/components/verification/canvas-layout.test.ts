import { describe, expect, it } from "vitest";
import { canvasSize, caretPosition, displayText, firstVisibleLine, layoutSegments } from "./canvas-layout";

/** Letra a letra, como una fuente monoespaciada: 24 px de Geist Mono son 14,4 px por letra. */
const mono = (charWidth: number) => (text: string) => text.length * charWidth;

describe("ajuste de línea del canvas", () => {
  it("cada palabra pasa a la línea siguiente si no cabe en la actual", () => {
    expect(layoutSegments(["abcd", "efgh", "ijkl"], mono(10), 100)).toEqual([
      { word: 0, start: 0, end: 4, line: 0, x: 0 },
      { word: 1, start: 0, end: 4, line: 0, x: 50 },
      { word: 2, start: 0, end: 4, line: 1, x: 0 },
    ]);
  });

  it("a 360 px, una palabra más larga que la línea empieza en otra y se parte por letras", () => {
    const width = 360 - 32; // `main` tiene 16 px de margen a cada lado.
    const long = "x".repeat(30); // 432 px: no cabe ni sola.
    const segments = layoutSegments(["casa", long, "sol"], mono(14.4), width);
    expect(segments).toEqual([
      { word: 0, start: 0, end: 4, line: 0, x: 0 },
      { word: 1, start: 0, end: 22, line: 1, x: 0 },
      { word: 1, start: 22, end: 30, line: 2, x: 0 },
      { word: 2, start: 0, end: 3, line: 2, x: 8 * 14.4 + 14.4 },
    ]);
    expect(segments.every((segment) => segment.x + (segment.end - segment.start) * 14.4 <= width)).toBe(true);
  });

  it("las letras de más se dibujan detrás de la palabra", () => {
    expect(displayText("sol", "solxx")).toBe("solxx");
    expect(displayText("sol", "s")).toBe("sol");
  });

  it("el cursor va tras lo tecleado de la palabra activa, también en el trozo de una palabra partida", () => {
    const texts = ["casa", "x".repeat(30), "sol"];
    const segments = layoutSegments(texts, mono(10), 100);
    expect(caretPosition(segments, texts, 0, 2, mono(10))).toEqual({ line: 0, x: 20 });
    expect(caretPosition(segments, texts, 1, 12, mono(10))).toEqual({ line: 2, x: 20 });
    // Al acabar el texto (`current` = número de palabras), tras la última letra.
    expect(caretPosition(segments, texts, 3, 0, mono(10))).toEqual({ line: 4, x: 30 });
  });

  it("la línea del cursor queda la segunda de las tres a la vista", () => {
    expect(firstVisibleLine(0)).toBe(0);
    expect(firstVisibleLine(1)).toBe(0);
    expect(firstVisibleLine(5)).toBe(4);
  });
});

describe("tamaño del canvas", () => {
  it("dibuja a la resolución del dispositivo para que el texto se vea nítido", () => {
    expect(canvasSize(328, 120, 2)).toEqual({ width: 656, height: 240, scale: 2 });
    expect(canvasSize(328, 120, 2.625)).toEqual({ width: 861, height: 315, scale: 2.625 });
    expect(canvasSize(360, 120, 3)).toEqual({ width: 1080, height: 360, scale: 3 });
    expect(canvasSize(328, 120, 0)).toEqual({ width: 328, height: 120, scale: 1 });
  });
});
