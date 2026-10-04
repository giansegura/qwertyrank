import { describe, expect, it } from "vitest";
import { getInitialWords } from "./initial-words";
import { WORDS_PER_TEST } from "./languages";

describe("getInitialWords", () => {
  it("devuelve siempre las mismas palabras para un idioma", async () => {
    const first = await getInitialWords("es");
    const second = await getInitialWords("es");
    expect(first).toHaveLength(WORDS_PER_TEST);
    expect(second).toEqual(first);
  });

  it("cambia según el idioma", async () => {
    expect(await getInitialWords("en")).not.toEqual(await getInitialWords("pt"));
  });
});
