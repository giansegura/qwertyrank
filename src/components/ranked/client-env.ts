import type { ClientEnv } from "@/lib/game/types";

/** Device signals sent at start. The server decides based on the shape of the keystrokes. */
export function readClientEnv(): ClientEnv {
  return {
    coarse: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    touchPoints: navigator.maxTouchPoints ?? 0,
  };
}
