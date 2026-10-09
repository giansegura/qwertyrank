/**
 * Placement of the verification game's text in the `canvas` (spec 4b §3.2), without DOM: the same
 * measurements as `WordsView` (`text-2xl`, 40 px lines, three in view and the active one second).
 */

export const FONT_SIZE = 24;
export const LINE_HEIGHT = 40;
export const VISIBLE_LINES = 3;

export type Measure = (text: string) => number;

/** A piece of a word on a line: almost always the whole word; one wider than the line is split. */
export interface Segment {
  word: number;
  /** Letters [start, end) of the word's text. */
  start: number;
  end: number;
  line: number;
  x: number;
}

/** What is drawn of a word: the target and, after it, any extra letters typed. */
export function displayText(target: string, typed: string): string {
  return typed.length > target.length ? target + typed.slice(target.length) : target;
}

/**
 * Line wrapping: each word goes to the next line if it does not fit on the current one. A word wider
 * than the line starts on a new one and is split by letters (at 360 px, with long words).
 */
export function layoutSegments(texts: readonly string[], measure: Measure, maxWidth: number): Segment[] {
  const space = measure(" ");
  const segments: Segment[] = [];
  let line = 0;
  let x = 0;
  texts.forEach((text, word) => {
    const width = measure(text);
    if (width <= maxWidth) {
      if (x > 0 && x + width > maxWidth) {
        line++;
        x = 0;
      }
      segments.push({ word, start: 0, end: text.length, line, x });
      x += width + space;
      return;
    }
    if (x > 0) {
      line++;
      x = 0;
    }
    let start = 0;
    while (start < text.length) {
      let end = start + 1;
      while (end < text.length && measure(text.slice(start, end + 1)) <= maxWidth) end++;
      segments.push({ word, start, end, line, x: 0 });
      if (end < text.length) line++;
      else x = measure(text.slice(start, end)) + space;
      start = end;
    }
  });
  return segments;
}

/** Where the cursor goes: in word `current`, after `index` letters. When the text ends, after the last one. */
export function caretPosition(
  segments: readonly Segment[],
  texts: readonly string[],
  current: number,
  index: number,
  measure: Measure,
): { line: number; x: number } {
  const own = segments.filter((segment) => segment.word === current);
  const last = segments.at(-1);
  if (own.length === 0) return last ? { line: last.line, x: last.x + measure(texts[last.word].slice(last.start, last.end)) } : { line: 0, x: 0 };
  const segment = own.find((candidate) => index < candidate.end) ?? own[own.length - 1];
  return { line: segment.line, x: segment.x + measure(texts[current].slice(segment.start, Math.min(index, segment.end))) };
}

/** First line in view: the cursor's line ends up second (like `WordsView`). */
export function firstVisibleLine(caretLine: number): number {
  return Math.max(0, caretLine - 1);
}

/**
 * Canvas size in device pixels: with `devicePixelRatio` 2 or 3 it draws at that resolution
 * and scales, so the text looks sharp.
 */
export function canvasSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number; scale: number } {
  const scale = dpr > 0 ? dpr : 1;
  return { width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale), scale };
}
