import { describe, expect, it } from "vitest";
import { generateWords } from "./generate";
import { mulberry32 } from "./rng";

describe("generateWords", () => {
  it("devuelve el número de palabras pedido, todas de la lista", () => {
    const list = ["uno", "dos", "tres"];
    const words = generateWords(list, 50, mulberry32(1));
    expect(words).toHaveLength(50);
    expect(words.every((word) => list.includes(word))).toBe(true);
  });

  it("no repite la misma palabra dos veces seguidas", () => {
    const words = generateWords(["a", "b"], 200, mulberry32(3));
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
  });

  it("no se bloquea con un generador constante", () => {
    expect(generateWords(["a", "b", "c"], 4, () => 0)).toEqual(["a", "b", "a", "b"]);
  });

  it("tolera un generador que devuelve 1", () => {
    expect(generateWords(["a", "b"], 1, () => 1)).toEqual(["b"]);
  });

  it("con una sola palabra la repite", () => {
    expect(generateWords(["solo"], 3, Math.random)).toEqual(["solo", "solo", "solo"]);
  });

  it("falla con una lista vacía", () => {
    expect(() => generateWords([], 3, Math.random)).toThrow("La lista de palabras está vacía");
  });
});
