import "server-only";

/** A game's rhythm, without text or keys (spec 5a §3.3): the only thing kept after deleting its keystrokes. */
export interface Rhythm {
  /** Milliseconds between consecutive text changes (`input` events). Present on physical and touch keyboards. */
  intervalsMs: number[];
  /** Milliseconds of each keystroke, from `down` to its `up` with the same `code` (empty `code` does not count). Usually missing on touch. */
  holdsMs: number[];
}

interface TimedEvent {
  t: number;
  type: string;
  code?: unknown;
}

const isTimedEvent = (event: unknown): event is TimedEvent =>
  typeof event === "object" &&
  event !== null &&
  typeof (event as TimedEvent).type === "string" &&
  Number.isFinite((event as TimedEvent).t);

/** Cap for an interval or keystroke: the client's `t` is unbounded and the column is `integer` (int32). */
export const MAX_RHYTHM_MS = 60_000;
const capped = (ms: number) => Math.min(MAX_RHYTHM_MS, Math.max(0, ms));

/** A valid instant: integer and never before the game start (a negative `t` counts as 0). */
const at = (event: TimedEvent) => Math.max(0, Math.round(event.t));

/**
 * The rhythm of already stored events, in arrival order. They come from an unvalidated log: it skips
 * those without `type` or a numeric `t`, an `up` without its `down`, the auto-repeats of a held key
 * (the first `down` counts), and `down`/`up` with an empty `code` (they cannot be paired). Never gives negative times.
 */
export function rhythmOf(events: readonly unknown[]): Rhythm {
  const intervalsMs: number[] = [];
  const holdsMs: number[] = [];
  const pressed = new Map<string, number>();
  let lastInput: number | null = null;

  for (const event of events) {
    if (!isTimedEvent(event)) continue;
    const t = at(event);
    if (event.type === "input") {
      if (lastInput !== null) intervalsMs.push(capped(t - lastInput));
      lastInput = t;
    } else if (typeof event.code === "string" && event.code !== "") {
      if (event.type === "down" && !pressed.has(event.code)) pressed.set(event.code, t);
      if (event.type === "up") {
        const down = pressed.get(event.code);
        if (down !== undefined) {
          holdsMs.push(capped(t - down));
          pressed.delete(event.code);
        }
      }
    }
  }
  return { intervalsMs, holdsMs };
}

/** The Monday (UTC) of a date's week, `YYYY-MM-DD`: the sample does not store the day (spec 5a §3.3). */
export function weekOf(date: Date): string {
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday))
    .toISOString()
    .slice(0, 10);
}
