import { describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { DEV_ANTICHEAT_CONFIG as C } from "./config";
import { checkEvents, checkSpeed, checkTiming, type ReceivedBatch } from "./rules";
import { inputOnly, typed } from "@/test/typing-events";

const STARTS_AT = 1_000_000;
const DEADLINE = STARTS_AT + 30_000 + 3_000;

function batch(seq: number, arrivedAt: number, events: TypingEvent[]): ReceivedBatch {
  return { seq, arrivedAt, events };
}

describe("checkTiming", () => {
  const honest = [batch(1, STARTS_AT + 3_100, typed("hola ", { start: 100 }))];

  it("acepta una partida honesta", () => {
    expect(checkTiming(honest, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 }, C)).toBeNull();
  });

  it("rechaza un final después de la hora límite", () => {
    expect(checkTiming(honest, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: DEADLINE + 1, lastSeq: 1 }, C)).toBe("late");
  });

  it("rechaza una tanda que llega después de la hora límite", () => {
    const late = [batch(1, DEADLINE + 5, typed("a"))];
    expect(checkTiming(late, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: DEADLINE, lastSeq: 1 }, C)).toBe("late");
  });

  it("rechaza si faltan tandas respecto a lastSeq", () => {
    expect(checkTiming(honest, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 2 }, C)).toBe("incomplete");
  });

  it("rechaza pulsaciones antes del 0 (durante la cuenta atrás)", () => {
    const early = [batch(1, STARTS_AT + 3_000, typed("a", { start: -10 }))];
    expect(checkTiming(early, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 }, C)).toBe("early_input");
  });

  it("rechaza eventos con una hora posterior a la llegada de su tanda (registro fabricado)", () => {
    const fabricated = [batch(1, STARTS_AT + 1_000, typed("a", { start: 2_000 }))];
    expect(checkTiming(fabricated, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 }, C)).toBe("fabricated_timing");
  });

  it("tolera 250 ms de diferencia de reloj", () => {
    const skewed = [batch(1, STARTS_AT + 1_000, typed("a", { start: 1_100, hold: 50 }))];
    expect(checkTiming(skewed, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 }, C)).toBeNull();
  });
});

describe("checkEvents", () => {
  it("acepta tecleo humano en teclado físico", () => {
    expect(checkEvents(typed("hola mundo azul casa "), "physical", C)).toBeNull();
  });

  it("rechaza eventos no generados por el usuario (isTrusted = false)", () => {
    const events = typed("hola ");
    events[1] = { ...events[1], trusted: false };
    expect(checkEvents(events, "physical", C)).toBe("untrusted");
  });

  it("en teclado físico rechaza texto sin pulsación de tecla (inyectado)", () => {
    expect(checkEvents(inputOnly("hola "), "physical", C)).toBe("injected_input");
  });

  it("en táctil no exige pulsaciones de tecla", () => {
    expect(checkEvents(inputOnly("hola mundo "), "touch", C)).toBeNull();
  });

  it("en teclado físico rechaza cualquier inserción de varias letras a la vez", () => {
    const events: TypingEvent[] = [
      ...typed("ho"),
      { t: 400, type: "down", key: "Unidentified", code: "", trusted: true },
      { t: 401, type: "input", deleted: 0, inserted: "la ", trusted: true },
    ];
    expect(checkEvents(events, "physical", C)).toBe("multi_insert");
  });

  it(`en táctil tolera hasta ${C.touchMultiInsertLimit} inserciones múltiples (autocorrector) y rechaza más`, () => {
    const multi = (t: number): TypingEvent => ({ t, type: "input", deleted: 2, inserted: "ola", trusted: true });
    const tolerated = [...inputOnly("ab"), ...Array.from({ length: C.touchMultiInsertLimit }, (_, i) => multi(1_000 + i * 500))];
    expect(checkEvents(tolerated, "touch", C)).toBeNull();
    expect(checkEvents([...tolerated, multi(9_000)], "touch", C)).toBe("multi_insert");
  });

  it("una letra con tilde compuesta cuenta como una sola inserción", () => {
    const events: TypingEvent[] = [
      { t: 0, type: "down", key: "Dead", code: "Quote", trusted: true },
      { t: 100, type: "down", key: "a", code: "KeyA", trusted: true },
      { t: 101, type: "input", deleted: 0, inserted: "á", trusted: true },
    ];
    expect(checkEvents(events, "physical", C)).toBeNull();
  });

  it("mantener pulsada una tecla que no escribe (Mayús) no tapa texto inyectado", () => {
    const events: TypingEvent[] = [];
    for (let t = 0; t < 3_000; t += 33) events.push({ t, type: "down", key: "Shift", code: "ShiftLeft", trusted: true });
    events.push(...inputOnly("hola mundo", { start: 10, every: 45 }));
    expect(checkEvents(events.toSorted((a, b) => a.t - b.t), "physical", C)).toBe("injected_input");
  });

  it("cada letra necesita su propia pulsación: mantener una tecla no tapa otras letras inyectadas", () => {
    const events: TypingEvent[] = [];
    for (let t = 0; t < 3_000; t += 33) events.push({ t, type: "down", key: "a", code: "KeyA", trusted: true });
    events.push(...inputOnly("hola mundo", { start: 10, every: 45 }));
    expect(checkEvents(events.toSorted((a, b) => a.t - b.t), "physical", C)).toBe("injected_input");
  });

  it("acepta pulsaciones solapadas: dos keydown seguidos y después sus letras", () => {
    const events: TypingEvent[] = [
      { t: 0, type: "down", key: "h", code: "KeyH", trusted: true },
      { t: 5, type: "down", key: "o", code: "KeyO", trusted: true },
      { t: 6, type: "input", deleted: 0, inserted: "h", trusted: true },
      { t: 7, type: "input", deleted: 0, inserted: "o", trusted: true },
    ];
    expect(checkEvents(events, "physical", C)).toBeNull();
  });

  it("una tilde suelta (tecla muerta + espacio) cuenta como pulsada", () => {
    const events: TypingEvent[] = [
      { t: 0, type: "down", key: "Dead", code: "Quote", trusted: true },
      { t: 100, type: "down", key: " ", code: "Space", trusted: true },
      { t: 101, type: "input", deleted: 0, inserted: "´", trusted: true },
    ];
    expect(checkEvents(events, "physical", C)).toBeNull();
  });

  it("es lineal: revisa 100.000 pulsaciones en menos de un segundo", () => {
    const events: TypingEvent[] = [];
    for (let i = 0; i < 100_000; i++) {
      const t = (i * 29_000) / 100_000;
      events.push({ t, type: "down", key: "a", code: "KeyA", trusted: true });
      events.push({ t: t + 0.1, type: "input", deleted: 0, inserted: "a", trusted: true });
    }
    const started = performance.now();
    checkEvents(events, "physical", C);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it(`rechaza ráfagas inhumanas (mediana < ${C.burstMedianMs} ms en 20 pulsaciones)`, () => {
    expect(checkEvents(typed("abcdefghijklmnopqrstuvwxyz", { every: 10, hold: 5 }), "physical", C)).toBe("inhuman_burst");
  });

  it("acepta ráfagas rápidas pero humanas", () => {
    expect(checkEvents(typed("abcdefghijklmnopqrstuvwxyz", { every: 40, hold: 30 }), "physical", C)).toBeNull();
  });
});

describe("checkSpeed", () => {
  it("rechaza PPM por encima del techo de cada categoría", () => {
    expect(checkSpeed(321, "physical", C)).toBe("inhuman_speed");
    expect(checkSpeed(320, "physical", C)).toBeNull();
    expect(checkSpeed(221, "touch", C)).toBe("inhuman_speed");
    expect(checkSpeed(200, "touch", C)).toBeNull();
  });
});

describe("configuración", () => {
  it("los umbrales salen de la configuración que recibe, no de constantes del código", () => {
    const strict = { ...C, burstMedianMs: 50, wpmCeiling: { physical: 200, touch: 150 } };
    const fast = typed("abcdefghijklmnopqrstuvwxyz", { every: 40, hold: 30 });
    expect(checkEvents(fast, "physical", C)).toBeNull();
    expect(checkEvents(fast, "physical", strict)).toBe("inhuman_burst");
    expect(checkSpeed(250, "physical", C)).toBeNull();
    expect(checkSpeed(250, "physical", strict)).toBe("inhuman_speed");
  });
});
