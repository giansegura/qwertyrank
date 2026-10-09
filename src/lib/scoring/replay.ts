import { applyInput, createEngine } from "./engine";
import { accuracyPercent, countCorrectChars, countTypedChars, wordsPerMinute } from "./metrics";
import type { InputTypingEvent, TypingEvent } from "./types";

export interface TestResult {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctChars: number;
  typedChars: number;
  /** Cumulative WPM at the end of each second (length = ceil(durationMs / 1000)). */
  perSecond: number[];
  mistakes: Record<string, number>;
}

/** The server replays untrustworthy events: anything without the expected shape is ignored. */
function isValidInput(event: unknown): event is InputTypingEvent {
  if (typeof event !== "object" || event === null) return false;
  const candidate = event as Record<string, unknown>;
  return (
    candidate.type === "input" &&
    typeof candidate.t === "number" &&
    Number.isFinite(candidate.t) &&
    typeof candidate.inserted === "string" &&
    Number.isInteger(candidate.deleted) &&
    (candidate.deleted as number) >= 0
  );
}

export function replay(
  words: readonly string[],
  events: readonly TypingEvent[],
  durationMs: number,
): TestResult {
  const inputs = events
    .filter((event): event is InputTypingEvent => isValidInput(event) && event.t >= 0 && event.t <= durationMs)
    .toSorted((a, b) => a.t - b.t);

  const seconds = Math.ceil(durationMs / 1000);
  const perSecond: number[] = [];
  let state = createEngine(words);
  let second = 1;

  for (const event of inputs) {
    while (second <= seconds && event.t > second * 1000) {
      perSecond.push(wordsPerMinute(countCorrectChars(state), second * 1000));
      second++;
    }
    state = applyInput(state, event.deleted, event.inserted);
  }
  while (second <= seconds) {
    perSecond.push(wordsPerMinute(countCorrectChars(state), Math.min(second * 1000, durationMs)));
    second++;
  }

  const correctChars = countCorrectChars(state);
  const typedChars = countTypedChars(state);
  return {
    wpm: wordsPerMinute(correctChars, durationMs),
    rawWpm: wordsPerMinute(typedChars, durationMs),
    accuracy: accuracyPercent(state.correctInserts, state.totalInserts),
    correctChars,
    typedChars,
    perSecond,
    mistakes: { ...state.mistakes },
  };
}
