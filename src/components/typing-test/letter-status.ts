/** Estado de una palabra del texto y de cada una de sus letras. Lo comparten el DOM (`Word`) y el `canvas`. */
export type WordState = "done" | "active" | "pending";
export type LetterStatus = "pending" | "correct" | "incorrect" | "extra" | "missed";

export function letterStatus(expected: string | undefined, actual: string | undefined, state: WordState): LetterStatus {
  if (actual === undefined) return state === "done" ? "missed" : "pending";
  if (expected === undefined) return "extra";
  return actual === expected ? "correct" : "incorrect";
}
