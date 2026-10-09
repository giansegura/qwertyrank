import { applyInput, createEngine } from "../scoring/engine";
import type { FrameDelta } from "./playback";

/**
 * Replay of a game in the panel (spec 4b §6.2), from its keystroke log.
 * The log is not trustworthy (it may be from a rejected game): everything is validated here.
 */

/** A change in the typed text, ready to be replayed. */
export interface InputStep {
  t: number;
  deleted: number;
  inserted: string;
}

/**
 * The log's `input` events, in order: whatever lacks the expected shape is discarded; a negative `t`
 * counts as 0 and one after the 30 s is replayed anyway (the game is shown exactly as it arrived).
 */
export function replayInputs(events: readonly unknown[]): InputStep[] {
  const steps: InputStep[] = [];
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const { type, t, deleted, inserted } = event as Record<string, unknown>;
    if (type !== "input" || typeof t !== "number" || !Number.isFinite(t) || typeof inserted !== "string") continue;
    if (typeof deleted !== "number" || !Number.isInteger(deleted) || deleted < 0) continue;
    steps.push({ t: Math.max(0, t), deleted, inserted });
  }
  return steps.toSorted((a, b) => a.t - b.t);
}

/** What was typed at an instant: what was typed in each word and which one is active. */
export interface ReplayFrame {
  t: number;
  typed: readonly string[];
  current: number;
}

const WHITESPACE = /\s/u;

/** Without reference text (logs from before 4b): only what was typed, word by word. */
function typeFreely(typed: readonly string[], { deleted, inserted }: InputStep): string[] {
  const next = [...typed];
  let last = next.length - 1;
  next[last] = next[last].slice(0, Math.max(0, next[last].length - deleted));
  for (const char of inserted) {
    if (!WHITESPACE.test(char)) next[last] += char;
    else if (next[last].length > 0) {
      next.push("");
      last++;
    }
  }
  return next;
}

/**
 * One frame after each keystroke, starting with the empty text. With the game's words, as the server
 * scored it (`applyInput`); without them, only what was typed.
 */
export function buildFrames(words: readonly string[] | null, steps: readonly InputStep[]): ReplayFrame[] {
  const frames: ReplayFrame[] = [{ t: 0, typed: [""], current: 0 }];
  if (words) {
    let state = createEngine(words);
    for (const step of steps) {
      state = applyInput(state, step.deleted, step.inserted);
      frames.push({ t: step.t, typed: state.typed, current: state.current });
    }
    return frames;
  }
  let typed: readonly string[] = [""];
  for (const step of steps) {
    typed = typeFreely(typed, step);
    frames.push({ t: step.t, typed, current: typed.length - 1 });
  }
  return frames;
}

/**
 * The frames for the browser, in compact form (`typedAt` rebuilds them): each one carries only what was typed
 * from the previous one's active word on, because the earlier words no longer change. That way a game with
 * thousands of keystrokes does not send thousands of copies of the text.
 */
export function compactFrames(frames: readonly ReplayFrame[]): FrameDelta[] {
  let from = 0;
  return frames.map((frame) => {
    const delta = { t: frame.t, from, tail: frame.typed.slice(from) };
    from = frame.current;
    return delta;
  });
}

export interface RhythmPoint {
  t: number;
  ms: number;
}

/**
 * Rhythm of the game (spec 4b §6.2): the interval between a letter and the previous one and, with a physical
 * keyboard, how long each key was held down (`keydown` → `keyup` of the same key).
 */
export function rhythm(events: readonly unknown[], inputType: "physical" | "touch"): { intervals: RhythmPoint[]; holds: RhythmPoint[] } {
  const letters = replayInputs(events).filter((step) => step.inserted !== "");
  const intervals = letters.slice(1).map((step, index) => ({ t: step.t, ms: step.t - letters[index].t }));
  if (inputType !== "physical") return { intervals, holds: [] };

  const keys = events
    .filter((event): event is { type: "down" | "up"; t: number; key?: unknown; code?: unknown } => {
      if (typeof event !== "object" || event === null) return false;
      const { type, t } = event as Record<string, unknown>;
      return (type === "down" || type === "up") && typeof t === "number" && Number.isFinite(t);
    })
    .toSorted((a, b) => a.t - b.t);
  const pressed = new Map<string, number>();
  const holds: RhythmPoint[] = [];
  for (const event of keys) {
    const id = typeof event.code === "string" && event.code ? event.code : String(event.key);
    if (event.type === "down") {
      if (!pressed.has(id)) pressed.set(id, event.t);
    } else if (pressed.has(id)) {
      const down = pressed.get(id)!;
      holds.push({ t: Math.max(0, down), ms: event.t - down });
      pressed.delete(id);
    }
  }
  return { intervals, holds };
}
