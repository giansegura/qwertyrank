import "server-only";
import type { ClientEnv, InputType } from "@/lib/game/types";
import type { KeyTypingEvent, TypingEvent } from "@/lib/scoring/types";

/**
 * Teclado físico o táctil, decidido por la forma de las pulsaciones (spec §4.5).
 * Heurística inicial: hay que calibrarla con partidas de dispositivos reales.
 */

export const MIN_KEYS_FOR_SIGNATURE = 10;
export const UNIDENTIFIED_RATIO = 0.5;
export const PHYSICAL_MIN_HOLD_MS = 20;

const IME_KEYS = new Set(["Unidentified", "Process"]);

function fromEnv(env: ClientEnv): InputType {
  return env.coarse && env.touchPoints > 0 ? "touch" : "physical";
}

/** Duración de cada pulsación: de un keydown al siguiente keyup de la misma tecla. */
function holdTimes(events: readonly TypingEvent[]): number[] {
  const pressed = new Map<string, number>();
  const holds: number[] = [];
  for (const event of events) {
    if (event.type !== "down" && event.type !== "up") continue;
    const id = (event as KeyTypingEvent).code || (event as KeyTypingEvent).key;
    if (event.type === "down") {
      if (!pressed.has(id)) pressed.set(id, event.t);
    } else if (pressed.has(id)) {
      holds.push(event.t - pressed.get(id)!);
      pressed.delete(id);
    }
  }
  return holds;
}

export function classifyInputType(events: readonly TypingEvent[], env: ClientEnv): InputType {
  const downs = events.filter((event): event is KeyTypingEvent => event.type === "down");
  if (downs.length < MIN_KEYS_FOR_SIGNATURE) return fromEnv(env);

  const unidentified = downs.filter((event) => IME_KEYS.has(event.key)).length;
  if (unidentified / downs.length > UNIDENTIFIED_RATIO) return "touch";

  const holds = holdTimes(events).toSorted((a, b) => a - b);
  if (holds.length < MIN_KEYS_FOR_SIGNATURE) return fromEnv(env);
  return holds[Math.floor(holds.length / 2)] >= PHYSICAL_MIN_HOLD_MS ? "physical" : "touch";
}
