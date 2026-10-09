import { describe, expect, it } from "vitest";
import { TEST_LANGUAGES, type TestLanguage } from "./languages";
import { loadWordList } from "./load";

const ALLOWED: Record<TestLanguage, RegExp> = {
  en: /^[a-z]+$/u,
  es: /^[a-záéíóúüñ]+$/u,
  pt: /^[a-záàâãçéêíóôõú]+$/u,
};

describe.each(TEST_LANGUAGES)("word list %s", (language) => {
  it("has 200 unique words", async () => {
    const list = await loadWordList(language);
    expect(list).toHaveLength(200);
    expect(new Set(list).size).toBe(200);
  });

  it("only uses the language's lowercase letters, in NFC form", async () => {
    const list = await loadWordList(language);
    for (const word of list) {
      expect(word, word).toMatch(ALLOWED[language]);
      expect(word.normalize("NFC"), word).toBe(word);
    }
  });
});
