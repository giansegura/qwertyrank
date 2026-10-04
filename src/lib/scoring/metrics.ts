import type { EngineState } from "./engine";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Caracteres de palabras correctas (con su espacio) + prefijo correcto de la palabra activa. */
export function countCorrectChars(state: EngineState): number {
  let total = 0;
  const committed = Math.min(state.current, state.words.length);
  for (let i = 0; i < committed; i++) {
    if (state.typed[i] === state.words[i]) total += state.words[i].length + 1;
  }
  if (state.current < state.words.length) {
    const soFar = state.typed[state.current];
    if (state.words[state.current].startsWith(soFar)) total += soFar.length;
  }
  return total;
}

/** Todos los caracteres escritos que siguen en pantalla, con los espacios de las palabras confirmadas. */
export function countTypedChars(state: EngineState): number {
  let total = 0;
  const committed = Math.min(state.current, state.words.length);
  for (let i = 0; i < committed; i++) total += state.typed[i].length + 1;
  if (state.current < state.words.length) total += state.typed[state.current].length;
  return total;
}

export function wordsPerMinute(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return round2(chars / 5 / (elapsedMs / 60_000));
}

export function accuracyPercent(correct: number, total: number): number {
  if (total === 0) return 0;
  return round2((correct / total) * 100);
}
