import { describe, expect, it } from "vitest";
import { getInitialWords } from "./initial-words";
import { WORDS_PER_TEST } from "./languages";

describe("getInitialWords", () => {
  it("always returns the same words for a language", async () => {
    const first = await getInitialWords("es");
    const second = await getInitialWords("es");
    expect(first).toHaveLength(WORDS_PER_TEST);
    expect(second).toEqual(first);
  });

  it("changes depending on the language", async () => {
    expect(await getInitialWords("en")).not.toEqual(await getInitialWords("pt"));
  });
});
