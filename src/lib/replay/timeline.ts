import { applyInput, createEngine } from "../scoring/engine";

/**
 * Reproducción de una partida en el panel (spec 4b §6.2), a partir de su registro de pulsaciones.
 * El registro no es de fiar (puede ser de una partida rechazada): todo se valida aquí.
 */

/** Un cambio en el texto escrito, listo para reproducirlo. */
export interface InputStep {
  t: number;
  deleted: number;
  inserted: string;
}

/**
 * Los eventos `input` del registro, en orden: se descarta lo que no tiene la forma esperada; un `t`
 * negativo cuenta como 0 y uno después de los 30 s se reproduce igual (la partida se ve tal cual llegó).
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

/** Lo escrito en un instante: lo tecleado en cada palabra y cuál es la activa. */
export interface ReplayFrame {
  t: number;
  typed: readonly string[];
  current: number;
}

const WHITESPACE = /\s/u;

/** Sin texto de referencia (registros anteriores a la 4b): solo lo tecleado, palabra a palabra. */
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
 * Un fotograma tras cada pulsación, empezando por el texto vacío. Con las palabras de la partida, como
 * la puntuó el servidor (`applyInput`); sin ellas, solo lo tecleado.
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

/** El fotograma de un instante: el último con `t` ≤ `elapsed` (búsqueda binaria). */
export function frameAt(frames: readonly ReplayFrame[], elapsed: number): ReplayFrame {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (frames[middle].t <= elapsed) low = middle;
    else high = middle - 1;
  }
  return frames[low];
}

export interface RhythmPoint {
  t: number;
  ms: number;
}

/**
 * Ritmo de la partida (spec 4b §6.2): el intervalo entre una letra y la anterior y, con teclado físico,
 * cuánto se mantuvo pulsada cada tecla (`keydown` → `keyup` de la misma tecla).
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
