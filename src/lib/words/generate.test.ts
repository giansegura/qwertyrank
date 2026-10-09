import { describe, expect, it } from "vitest";
import { generateWords } from "./generate";
import { mulberry32 } from "./rng";

describe("generateWords", () => {
  it("returns the requested number of words, all from the list", () => {
    const list = ["uno", "dos", "tres"];
    const words = generateWords(list, 50, mulberry32(1));
    expect(words).toHaveLength(50);
    expect(words.every((word) => list.includes(word))).toBe(true);
  });

  it("does not repeat the same word twice in a row", () => {
    const words = generateWords(["a", "b"], 200, mulberry32(3));
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
  });

  it("does not hang with a constant generator", () => {
    expect(generateWords(["a", "b", "c"], 4, () => 0)).toEqual(["a", "b", "a", "b"]);
  });

  it("tolerates a generator that returns 1", () => {
    expect(generateWords(["a", "b"], 1, () => 1)).toEqual(["b"]);
  });

  it("with a single word it repeats it", () => {
    expect(generateWords(["solo"], 3, Math.random)).toEqual(["solo", "solo", "solo"]);
  });

  it("fails with an empty list", () => {
    expect(() => generateWords([], 3, Math.random)).toThrow("The word list is empty");
  });
});
