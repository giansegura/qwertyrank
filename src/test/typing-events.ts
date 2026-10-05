import type { TypingEvent } from "@/lib/scoring/types";

/** Helpers para construir partidas en los tests del anti-trampas. */

export function typed(text: string, { start = 0, every = 150, hold = 60, code = true } = {}): TypingEvent[] {
  const events: TypingEvent[] = [];
  let t = start;
  for (const char of text) {
    const key = char === " " ? " " : char;
    const keyCode = code ? (char === " " ? "Space" : `Key${char.toUpperCase()}`) : "";
    events.push({ t, type: "down", key, code: keyCode, trusted: true });
    events.push({ t: t + 1, type: "input", deleted: 0, inserted: char, trusted: true });
    events.push({ t: t + hold, type: "up", key, code: keyCode, trusted: true });
    t += every;
  }
  return events;
}

export function inputOnly(text: string, { start = 0, every = 150 } = {}): TypingEvent[] {
  return [...text].map((char, i) => ({
    t: start + i * every,
    type: "input" as const,
    deleted: 0,
    inserted: char,
    trusted: true,
  }));
}
