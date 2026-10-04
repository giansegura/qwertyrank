import { describe, expect, it } from "vitest";
import { TEST_LANGUAGES, type TestLanguage } from "./languages";
import { loadWordList } from "./load";

const ALLOWED: Record<TestLanguage, RegExp> = {
  en: /^[a-z]+$/u,
  es: /^[a-záéíóúüñ]+$/u,
  pt: /^[a-záàâãçéêíóôõú]+$/u,
};

describe.each(TEST_LANGUAGES)("lista de palabras %s", (language) => {
  it("tiene 200 palabras únicas", async () => {
    const list = await loadWordList(language);
    expect(list).toHaveLength(200);
    expect(new Set(list).size).toBe(200);
  });

  it("solo usa minúsculas del idioma, en forma NFC", async () => {
    const list = await loadWordList(language);
    for (const word of list) {
      expect(word, word).toMatch(ALLOWED[language]);
      expect(word.normalize("NFC"), word).toBe(word);
    }
  });
});
