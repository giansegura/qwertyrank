export const TEST_LANGUAGES = ["en", "es", "pt"] as const;
export type TestLanguage = (typeof TEST_LANGUAGES)[number];

/** Words per game: covers the WPM ceiling of any category in 30 s. */
export const WORDS_PER_TEST = 160;
