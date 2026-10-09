import type { EngineState } from "./engine";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Characters of correct words (with their space) + correct prefix of the active word. */
export function countCorrectChars(state: EngineState): number {
  let total = 0;
  const committed = Math.min(state.current, state.words.length);
  for (let i = 0; i < committed; i++) {
    if (state.typed[i] === state.words[i]) total += state.words[i].length + 1;
  }
  if (state.current < state.words.length) {
    const soFar = state.typed[state.current];
    if (state.words[state.current].startsWith(soFar)) total += soFar.length;
  }
  return total;
}

/** All typed characters still on screen, with the spaces of the committed words. */
export function countTypedChars(state: EngineState): number {
  let total = 0;
  const committed = Math.min(state.current, state.words.length);
  for (let i = 0; i < committed; i++) total += state.typed[i].length + 1;
  if (state.current < state.words.length) total += state.typed[state.current].length;
  return total;
}

export function wordsPerMinute(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return round2(chars / 5 / (elapsedMs / 60_000));
}

export function accuracyPercent(correct: number, total: number): number {
  if (total === 0) return 0;
  return round2((correct / total) * 100);
}

/** WPM as displayed: rounded. */
export function displayWpm(wpm: number): number {
  return Math.round(wpm);
}

/** Accuracy as displayed: rounded down, so that 89.9 % never looks like the 90 % the ranking requires. */
export function displayAccuracy(accuracy: number): number {
  return Math.floor(accuracy);
}
