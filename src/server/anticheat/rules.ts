import "server-only";
import type { InputType, RejectReason } from "@/lib/game/types";
import type { InputTypingEvent, KeyTypingEvent, TypingEvent } from "@/lib/scoring/types";
import type { AnticheatConfig } from "./config";

/** Reglas que rechazan una partida (spec §4.2 y §4.3), con los umbrales de `AnticheatConfig`. */

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

export function checkTiming(
  batches: readonly ReceivedBatch[],
  window: TimingWindow,
  config: AnticheatConfig,
): RejectReason | null {
  if (window.finishedAt > window.deadline) return "late";
  if (batches.length !== window.lastSeq || batches.some((batch, i) => batch.seq !== i + 1)) return "incomplete";
  for (const batch of batches) {
    if (batch.arrivedAt > window.deadline) return "late";
    const elapsedAtArrival = batch.arrivedAt - window.startsAt;
    for (const event of batch.events) {
      if (event.t < 0) return "early_input";
      if (event.t > elapsedAtArrival + config.timingToleranceMs) return "fabricated_timing";
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
function hasInjectedInput(
  events: readonly TypingEvent[],
  inputs: readonly InputTypingEvent[],
  lookbackMs: number,
): boolean {
  const downs = events
    .filter((event): event is KeyTypingEvent => event.type === "down" && writesText(event.key))
    .toSorted((a, b) => a.t - b.t);
  const bases = downs.map((down) => baseChar(down.key));
  const used = new Uint8Array(downs.length);
  let first = 0;
  for (const input of inputs.toSorted((a, b) => a.t - b.t)) {
    // El inicio de la ventana salta las pulsaciones caducadas y las ya usadas.
    while (first < downs.length && (used[first] || downs[first].t < input.t - lookbackMs)) first++;
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

function hasInhumanBurst(inputs: readonly InputTypingEvent[], window: number, medianMs: number): boolean {
  const times = inputs.map((event) => event.t).toSorted((a, b) => a - b);
  for (let start = 0; start + window <= times.length; start++) {
    const intervals = [];
    for (let i = start + 1; i < start + window; i++) intervals.push(times[i] - times[i - 1]);
    if (median(intervals) < medianMs) return true;
  }
  return false;
}

export function checkEvents(events: readonly TypingEvent[], inputType: InputType, config: AnticheatConfig): RejectReason | null {
  if (events.some((event) => !event.trusted)) return "untrusted";

  const inputs = insertions(events);
  if (inputType === "physical" && hasInjectedInput(events, inputs, config.keydownLookbackMs)) return "injected_input";

  const multiInserts = inputs.filter((event) => [...event.inserted].length > 1).length;
  const allowed = inputType === "physical" ? 0 : config.touchMultiInsertLimit;
  if (multiInserts > allowed) return "multi_insert";

  if (hasInhumanBurst(inputs, config.burstWindow, config.burstMedianMs)) return "inhuman_burst";
  return null;
}

export function checkSpeed(wpm: number, inputType: InputType, config: AnticheatConfig): RejectReason | null {
  return wpm > config.wpmCeiling[inputType] ? "inhuman_speed" : null;
}
