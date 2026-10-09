export interface InputDiff {
  deleted: number;
  inserted: string;
}

/** Difference between two input values: how many characters were deleted from the end and what was added. */
export function diffInput(previous: string, next: string): InputDiff {
  const max = Math.min(previous.length, next.length);
  let common = 0;
  while (common < max && previous[common] === next[common]) common++;
  return { deleted: previous.length - common, inserted: next.slice(common) };
}

const DEAD_KEY_MARKS = /^[´`^¨~˜ˆ̀́̂̃̈]+$/u;

/**
 * On macOS, a dead key (´ ` ^ ¨ ~) shows the standalone accent while the letter is being
 * composed. That intermediate step is not a keystroke and must not count as an error.
 * With `afterDeadKey` (the last keydown was `"Dead"`) any standalone character is
 * accepted: this covers layouts like US-International, which use ' and ".
 */
export function isDeadKeyPreview(diff: InputDiff, isComposing: boolean, afterDeadKey = false): boolean {
  if (!isComposing || diff.deleted !== 0) return false;
  if (DEAD_KEY_MARKS.test(diff.inserted)) return true;
  return afterDeadKey && [...diff.inserted].length === 1;
}
