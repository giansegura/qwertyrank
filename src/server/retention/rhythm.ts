import "server-only";

/** El ritmo de una partida, sin texto ni teclas (spec 5a §3.3): lo único que se queda tras borrar sus pulsaciones. */
export interface Rhythm {
  /** Milisegundos entre cambios de texto consecutivos (eventos `input`). Existen con teclado físico y táctil. */
  intervalsMs: number[];
  /** Milisegundos de cada pulsación, de `down` a su `up` con el mismo `code`. Con teclado táctil suele faltar. */
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

/** Tope de un intervalo o una pulsación: el `t` del cliente no está acotado y la columna es `integer` (int32). */
export const MAX_RHYTHM_MS = 60_000;
const capped = (ms: number) => Math.min(MAX_RHYTHM_MS, Math.max(0, ms));

/** Un instante válido: entero y nunca antes del inicio de la partida (un `t` negativo cuenta como 0). */
const at = (event: TimedEvent) => Math.max(0, Math.round(event.t));

/**
 * El ritmo de unos eventos ya guardados, en orden de llegada. Son de un registro sin validar: se saltan
 * los que no tienen `type` o un `t` numérico, un `up` sin su `down`, y las repeticiones automáticas de una
 * tecla mantenida (cuenta el primer `down`). Nunca da tiempos negativos.
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
    } else if (typeof event.code === "string") {
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

/** El lunes (UTC) de la semana de una fecha, `AAAA-MM-DD`: el extracto no guarda el día (spec 5a §3.3). */
export function weekOf(date: Date): string {
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday))
    .toISOString()
    .slice(0, 10);
}
