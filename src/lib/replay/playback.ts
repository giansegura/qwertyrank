/**
 * The part of the replay that runs in the browser (spec 4b §6.2). It imports nothing: the scoring engine
 * stays on the server, and the panel shares no code with the home page (if it did, Next would move it
 * into shared chunks and the home page's JS would grow).
 */

/**
 * A compact frame: at instant `t`, what was typed from word `from` on (the earlier ones do not
 * change). The active word is the last one.
 */
export interface FrameDelta {
  t: number;
  from: number;
  tail: string[];
}

/** What was typed at `elapsed`: the frames that have already passed, applied in order. */
export function typedAt(frames: readonly FrameDelta[], elapsed: number): string[] {
  const typed: string[] = [];
  for (const frame of frames) {
    if (frame.t > elapsed) break;
    typed.length = frame.from;
    typed.push(...frame.tail);
  }
  return typed;
}
