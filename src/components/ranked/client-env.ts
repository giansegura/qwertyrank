import type { ClientEnv } from "@/lib/game/types";

/** Señales del dispositivo que se envían al empezar. El servidor decide con la forma de las pulsaciones. */
export function readClientEnv(): ClientEnv {
  return {
    coarse: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    touchPoints: navigator.maxTouchPoints ?? 0,
  };
}
