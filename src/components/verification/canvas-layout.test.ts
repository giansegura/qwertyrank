import { describe, expect, it } from "vitest";
import { canvasSize, caretPosition, displayText, firstVisibleLine, layoutSegments } from "./canvas-layout";

/** Letter by letter, like a monospaced font: 24 px of Geist Mono is 14.4 px per letter. */
const mono = (charWidth: number) => (text: string) => text.length * charWidth;

describe("canvas line wrapping", () => {
  it("each word moves to the next line if it does not fit on the current one", () => {
    expect(layoutSegments(["abcd", "efgh", "ijkl"], mono(10), 100)).toEqual([
      { word: 0, start: 0, end: 4, line: 0, x: 0 },
      { word: 1, start: 0, end: 4, line: 0, x: 50 },
      { word: 2, start: 0, end: 4, line: 1, x: 0 },
    ]);
  });

  it("at 360 px, a word longer than the line starts on a new one and is split by letters", () => {
    const width = 360 - 32; // `main` has a 16 px margin on each side.
    const long = "x".repeat(30); // 432 px: does not fit even on its own.
    const segments = layoutSegments(["casa", long, "sol"], mono(14.4), width);
    expect(segments).toEqual([
      { word: 0, start: 0, end: 4, line: 0, x: 0 },
      { word: 1, start: 0, end: 22, line: 1, x: 0 },
      { word: 1, start: 22, end: 30, line: 2, x: 0 },
      { word: 2, start: 0, end: 3, line: 2, x: 8 * 14.4 + 14.4 },
    ]);
    expect(segments.every((segment) => segment.x + (segment.end - segment.start) * 14.4 <= width)).toBe(true);
  });

  it("extra letters are drawn after the word", () => {
    expect(displayText("sol", "solxx")).toBe("solxx");
    expect(displayText("sol", "s")).toBe("sol");
  });

  it("the cursor goes after what was typed of the active word, also in a piece of a split word", () => {
    const texts = ["casa", "x".repeat(30), "sol"];
    const segments = layoutSegments(texts, mono(10), 100);
    expect(caretPosition(segments, texts, 0, 2, mono(10))).toEqual({ line: 0, x: 20 });
    expect(caretPosition(segments, texts, 1, 12, mono(10))).toEqual({ line: 2, x: 20 });
    // When the text ends (`current` = number of words), after the last letter.
    expect(caretPosition(segments, texts, 3, 0, mono(10))).toEqual({ line: 4, x: 30 });
  });

  it("the cursor line is the second of the three in view", () => {
    expect(firstVisibleLine(0)).toBe(0);
    expect(firstVisibleLine(1)).toBe(0);
    expect(firstVisibleLine(5)).toBe(4);
  });
});

describe("canvas size", () => {
  it("draws at the device resolution so the text looks sharp", () => {
    expect(canvasSize(328, 120, 2)).toEqual({ width: 656, height: 240, scale: 2 });
    expect(canvasSize(328, 120, 2.625)).toEqual({ width: 861, height: 315, scale: 2.625 });
    expect(canvasSize(360, 120, 3)).toEqual({ width: 1080, height: 360, scale: 3 });
    expect(canvasSize(328, 120, 0)).toEqual({ width: 328, height: 120, scale: 1 });
  });
});
