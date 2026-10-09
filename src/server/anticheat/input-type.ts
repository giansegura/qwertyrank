import "server-only";
import type { ClientEnv, InputType } from "@/lib/game/types";
import type { KeyTypingEvent, TypingEvent } from "@/lib/scoring/types";
import type { AnticheatConfig } from "./config";

/**
 * Physical or touch keyboard, decided by the shape of the keystrokes (spec §4.5).
 * Initial heuristic: it needs calibrating with games from real devices. Thresholds in `AnticheatConfig`.
 */

const IME_KEYS = new Set(["Unidentified", "Process"]);

function fromEnv(env: ClientEnv): InputType {
  return env.coarse && env.touchPoints > 0 ? "touch" : "physical";
}

/** Duration of each keystroke: from a keydown to the next keyup of the same key. */
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

export function classifyInputType(events: readonly TypingEvent[], env: ClientEnv, config: AnticheatConfig): InputType {
  const downs = events.filter((event): event is KeyTypingEvent => event.type === "down");
  if (downs.length < config.minKeysForSignature) return fromEnv(env);

  const unidentified = downs.filter((event) => IME_KEYS.has(event.key)).length;
  if (unidentified / downs.length > config.unidentifiedRatio) return "touch";

  const holds = holdTimes(events).toSorted((a, b) => a - b);
  if (holds.length < config.minKeysForSignature) return fromEnv(env);
  return holds[Math.floor(holds.length / 2)] >= config.physicalMinHoldMs ? "physical" : "touch";
}
