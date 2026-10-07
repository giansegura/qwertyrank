import { describe, expect, it } from "vitest";
import { typed } from "@/test/typing-events";
import { buildFrames, frameAt, replayInputs, rhythm } from "./timeline";

describe("pulsaciones para reproducir", () => {
  it("solo los `input` bien formados, en orden; un `t` negativo cuenta como 0 y uno tardío se queda", () => {
    const steps = replayInputs([
      { t: 300, type: "input", deleted: 0, inserted: "b", trusted: true },
      { t: -50, type: "input", deleted: 0, inserted: "a", trusted: false },
      { t: 31_000, type: "input", deleted: 1, inserted: "", trusted: true },
      { t: 10, type: "down", key: "a", code: "KeyA", trusted: true },
      { t: "100", type: "input", deleted: 0, inserted: "x" },
      { t: 100, type: "input", deleted: -1, inserted: "x" },
      { t: Number.NaN, type: "input", deleted: 0, inserted: "x" },
      null,
      "basura",
    ]);
    expect(steps).toEqual([
      { t: 0, deleted: 0, inserted: "a" },
      { t: 300, deleted: 0, inserted: "b" },
      { t: 31_000, deleted: 1, inserted: "" },
    ]);
  });
});

describe("fotogramas", () => {
  it("con las palabras, como lo puntuó el servidor: el error se queda en su palabra", () => {
    const frames = buildFrames(["hola", "sol"], replayInputs(typed("hxla s", { every: 100 })));
    expect(frames[0]).toEqual({ t: 0, typed: [""], current: 0 });
    expect(frames.at(-1)).toMatchObject({ typed: ["hxla", "s"], current: 1 });
    expect(frameAt(frames, 150)).toMatchObject({ typed: ["hx"] });
  });

  it("sin palabras (registro anterior a la 4b), solo lo tecleado, con borrados y espacios", () => {
    const steps = [
      { t: 0, deleted: 0, inserted: "c" },
      { t: 100, deleted: 0, inserted: "x" },
      { t: 200, deleted: 1, inserted: "asa" },
      { t: 300, deleted: 0, inserted: " " },
      { t: 400, deleted: 0, inserted: " " },
      { t: 500, deleted: 0, inserted: "y" },
    ];
    expect(buildFrames(null, steps).at(-1)).toEqual({ t: 500, typed: ["casa", "y"], current: 1 });
  });

  it("el fotograma de un instante es el último que ya ha pasado", () => {
    const frames = buildFrames(null, replayInputs(typed("abc", { every: 100 })));
    expect(frameAt(frames, 0).typed).toEqual([""]);
    expect(frameAt(frames, 101).typed).toEqual(["ab"]);
    expect(frameAt(frames, 99_999).typed).toEqual(["abc"]);
  });
});

describe("ritmo", () => {
  it("intervalos entre letras y, con teclado físico, cuánto dura cada pulsación", () => {
    const events = typed("abc", { every: 120, hold: 70 });
    expect(rhythm(events, "physical")).toEqual({
      intervals: [
        { t: 121, ms: 120 },
        { t: 241, ms: 120 },
      ],
      holds: [
        { t: 0, ms: 70 },
        { t: 120, ms: 70 },
        { t: 240, ms: 70 },
      ],
    });
    expect(rhythm(events, "touch").holds).toEqual([]);
  });

  it("no se rompe con eventos raros: teclas que no se sueltan, sin código o con `t` imposible", () => {
    const events = [
      { t: 0, type: "down", key: "a", code: "" },
      { t: 50, type: "up", key: "a", code: "" },
      { t: 60, type: "down", key: "b", code: "KeyB" },
      { t: Number.POSITIVE_INFINITY, type: "up", key: "b", code: "KeyB" },
      { t: "x", type: "down" },
    ];
    expect(rhythm(events, "physical")).toEqual({ intervals: [], holds: [{ t: 0, ms: 50 }] });
  });
});
