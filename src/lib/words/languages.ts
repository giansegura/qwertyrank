export const TEST_LANGUAGES = ["en", "es", "pt"] as const;
export type TestLanguage = (typeof TEST_LANGUAGES)[number];

/** Palabras por partida: cubre el techo de PPM de cualquier categoría en 30 s. */
export const WORDS_PER_TEST = 160;
