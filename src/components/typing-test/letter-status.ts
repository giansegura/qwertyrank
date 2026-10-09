/** Status of a word of the text and of each of its letters. Shared by the DOM (`Word`) and the `canvas`. */
export type WordState = "done" | "active" | "pending";
export type LetterStatus = "pending" | "correct" | "incorrect" | "extra" | "missed";

export function letterStatus(expected: string | undefined, actual: string | undefined, state: WordState): LetterStatus {
  if (actual === undefined) return state === "done" ? "missed" : "pending";
  if (expected === undefined) return "extra";
  return actual === expected ? "correct" : "incorrect";
}
