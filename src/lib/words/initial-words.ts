import { generateWords } from "./generate";
import { WORDS_PER_TEST, type TestLanguage } from "./languages";
import { loadWordList } from "./load";
import { mulberry32 } from "./rng";

/** Fixed seed: the initial text is deterministic so that the page is static. */
export const INITIAL_WORDS_SEED = 20_261_004;

export async function getInitialWords(language: TestLanguage): Promise<string[]> {
  const list = await loadWordList(language);
  return generateWords(list, WORDS_PER_TEST, mulberry32(INITIAL_WORDS_SEED));
}
