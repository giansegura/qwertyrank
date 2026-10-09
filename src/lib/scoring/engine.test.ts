import { describe, expect, it } from "vitest";
import { MAX_EXTRA_CHARS, applyInput, createEngine, isFinished } from "./engine";

function type(words: string[], ...chunks: string[]) {
  return chunks.reduce((state, chunk) => applyInput(state, 0, chunk), createEngine(words));
}

describe("engine", () => {
  it("starts at the first word with nothing typed", () => {
    const state = createEngine(["hola", "mundo"]);
    expect(state.current).toBe(0);
    expect(state.typed).toEqual([""]);
    expect(isFinished(state)).toBe(false);
  });

  it("counts the correct letters and advances with the space", () => {
    const state = type(["hola", "mundo"], "hola ");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
    expect(state.correctInserts).toBe(5);
    expect(state.totalInserts).toBe(5);
  });

  it("records the expected character as a mistake when another one is typed", () => {
    const state = type(["casa"], "cosa");
    expect(state.correctInserts).toBe(3);
    expect(state.totalInserts).toBe(4);
    expect(state.mistakes).toEqual({ a: 1 });
  });

  it("the space of an incorrect word counts as an incorrect keystroke", () => {
    const state = type(["casa", "azul"], "cosa ");
    expect(state.current).toBe(1);
    expect(state.totalInserts).toBe(5);
    expect(state.correctInserts).toBe(3);
  });

  it("ignores a space at the start of a word (double space)", () => {
    const state = type(["hola", "mundo"], " ", "hola  ");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
    expect(state.totalInserts).toBe(5);
  });

  it("accepts any whitespace as a space (e.g. NBSP from mobile keyboards)", () => {
    const state = type(["hola", "mundo"], "hola ");
    expect(state.current).toBe(1);
    expect(state.correctInserts).toBe(5);
  });

  it("counts extra characters as incorrect, up to a maximum", () => {
    const state = type(["sol"], "sol" + "x".repeat(MAX_EXTRA_CHARS + 5));
    expect(state.typed[0]).toBe("sol" + "x".repeat(MAX_EXTRA_CHARS));
    expect(state.totalInserts).toBe(3 + MAX_EXTRA_CHARS);
    expect(state.mistakes).toEqual({});
  });

  it("deletes only within the current word", () => {
    let state = type(["hola", "mundo"], "hola ", "mu");
    state = applyInput(state, 5, "");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
  });

  it("deleting and retyping fixes the word, but the mistakes still count", () => {
    let state = type(["gato"], "gatp");
    state = applyInput(state, 1, "o");
    expect(state.typed[0]).toBe("gato");
    expect(state.totalInserts).toBe(5);
    expect(state.correctInserts).toBe(4);
    expect(state.mistakes).toEqual({ o: 1 });
  });

  it("an uppercase letter does not match the expected lowercase one", () => {
    const state = type(["casa"], "Casa");
    expect(state.mistakes).toEqual({ c: 1 });
  });

  it("processes several characters at once, spaces included", () => {
    const state = type(["uno", "dos", "tres"], "uno dos t");
    expect(state.current).toBe(2);
    expect(state.typed).toEqual(["uno", "dos", "t"]);
  });

  it("finishes when the last word is committed and ignores whatever comes after", () => {
    const finished = type(["fin"], "fin ");
    expect(isFinished(finished)).toBe(true);
    expect(applyInput(finished, 0, "abc")).toBe(finished);
  });

  it("ignores an invalid number of deletions", () => {
    const state = applyInput(type(["hola"], "ho"), Number.NaN, "l");
    expect(state.typed[0]).toBe("hol");
  });

  it("does not modify the previous state", () => {
    const before = type(["hola"], "h");
    applyInput(before, 0, "o");
    expect(before.typed).toEqual(["h"]);
  });
});
