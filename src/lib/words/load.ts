import type { TestLanguage } from "./languages";

/** Carga la lista de palabras de un idioma en un chunk aparte. */
export async function loadWordList(language: TestLanguage): Promise<readonly string[]> {
  switch (language) {
    case "en":
      return (await import("@words/en.json")).default;
    case "es":
      return (await import("@words/es.json")).default;
    case "pt":
      return (await import("@words/pt.json")).default;
  }
}
