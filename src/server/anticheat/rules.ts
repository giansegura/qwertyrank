import "server-only";
import type { InputType, RejectReason } from "@/lib/game/types";
import type { InputTypingEvent, KeyTypingEvent, TypingEvent } from "@/lib/scoring/types";

/** Reglas que rechazan una partida (spec §4.2 y §4.3). Valores iniciales, ajustables con datos reales. */

export const TIMING_TOLERANCE_MS = 250;
export const BURST_WINDOW = 20;
export const BURST_MEDIAN_MS = 25;
export const KEYDOWN_LOOKBACK_MS = 1_000;
export const TOUCH_MULTI_INSERT_LIMIT = 2;
export const WPM_CEILING: Record<InputType, number> = { physical: 320, touch: 220 };

/** Una tanda de eventos tal como la recibió el servidor, con la hora oficial de llegada. */
export interface ReceivedBatch {
  seq: number;
  arrivedAt: number;
  events: TypingEvent[];
}

export interface TimingWindow {
  startsAt: number;
  deadline: number;
  finishedAt: number;
  lastSeq: number;
}

export function checkTiming(batches: readonly ReceivedBatch[], window: TimingWindow): RejectReason | null {
  if (window.finishedAt > window.deadline) return "late";
  if (batches.length !== window.lastSeq || batches.some((batch, i) => batch.seq !== i + 1)) return "incomplete";
  for (const batch of batches) {
    if (batch.arrivedAt > window.deadline) return "late";
    const elapsedAtArrival = batch.arrivedAt - window.startsAt;
    for (const event of batch.events) {
      if (event.t < 0) return "early_input";
      if (event.t > elapsedAtArrival + TIMING_TOLERANCE_MS) return "fabricated_timing";
    }
  }
  return null;
}

function insertions(events: readonly TypingEvent[]): InputTypingEvent[] {
  return events.filter((event): event is InputTypingEvent => event.type === "input" && event.inserted !== "");
}

/** Teclas que escriben sin coincidir con la letra: tecla muerta y teclados con IME. */
const COMPOSING_KEYS = new Set(["Dead", "Process", "Unidentified"]);

function writesText(key: string): boolean {
  return [...key].length === 1 || COMPOSING_KEYS.has(key);
}

/** Letra base sin tilde y en minúscula: "Á" → "a". */
function baseChar(text: string): string {
  return text.normalize("NFD").charAt(0).toLowerCase();
}

/**
 * Cada inserción necesita su propia pulsación en el segundo anterior: de la misma tecla
 * (sin contar tildes) o de una tecla de composición. Cada keydown se usa una sola vez,
 * así que mantener una tecla pulsada no tapa texto inyectado. Lineal: ambas listas van ordenadas.
 */
function hasInjectedInput(events: readonly TypingEvent[], inputs: readonly InputTypingEvent[]): boolean {
  const downs = events
    .filter((event): event is KeyTypingEvent => event.type === "down" && writesText(event.key))
    .toSorted((a, b) => a.t - b.t);
  const bases = downs.map((down) => baseChar(down.key));
  const used = new Uint8Array(downs.length);
  let first = 0;
  for (const input of inputs.toSorted((a, b) => a.t - b.t)) {
    // El inicio de la ventana salta las pulsaciones caducadas y las ya usadas.
    while (first < downs.length && (used[first] || downs[first].t < input.t - KEYDOWN_LOOKBACK_MS)) first++;
    const wanted = baseChar(input.inserted);
    let match = -1;
    for (let i = first; i < downs.length && downs[i].t <= input.t; i++) {
      if (used[i]) continue;
      if (bases[i] === wanted) {
        match = i;
        break;
      }
      if (match === -1 && COMPOSING_KEYS.has(downs[i].key)) match = i;
    }
    if (match === -1) return true;
    used[match] = 1;
  }
  return false;
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function hasInhumanBurst(inputs: readonly InputTypingEvent[]): boolean {
  const times = inputs.map((event) => event.t).toSorted((a, b) => a - b);
  for (let start = 0; start + BURST_WINDOW <= times.length; start++) {
    const intervals = [];
    for (let i = start + 1; i < start + BURST_WINDOW; i++) intervals.push(times[i] - times[i - 1]);
    if (median(intervals) < BURST_MEDIAN_MS) return true;
  }
  return false;
}

export function checkEvents(events: readonly TypingEvent[], inputType: InputType): RejectReason | null {
  if (events.some((event) => !event.trusted)) return "untrusted";

  const inputs = insertions(events);
  if (inputType === "physical" && hasInjectedInput(events, inputs)) return "injected_input";

  const multiInserts = inputs.filter((event) => [...event.inserted].length > 1).length;
  const allowed = inputType === "physical" ? 0 : TOUCH_MULTI_INSERT_LIMIT;
  if (multiInserts > allowed) return "multi_insert";

  if (hasInhumanBurst(inputs)) return "inhuman_burst";
  return null;
}

export function checkSpeed(wpm: number, inputType: InputType): RejectReason | null {
  return wpm > WPM_CEILING[inputType] ? "inhuman_speed" : null;
}
