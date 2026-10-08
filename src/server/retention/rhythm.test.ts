// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_RHYTHM_MS, rhythmOf, weekOf } from "./rhythm";

const down = (t: number, code: string) => ({ t, type: "down", key: code.slice(-1).toLowerCase(), code, trusted: true });
const up = (t: number, code: string) => ({ t, type: "up", key: code.slice(-1).toLowerCase(), code, trusted: true });
const input = (t: number, inserted: string) => ({ t, type: "input", deleted: 0, inserted, trusted: true });

describe("rhythmOf", () => {
  it("intervalos entre cambios de texto y duración de cada pulsación", () => {
    const events = [
      down(0, "KeyH"),
      input(1, "h"),
      up(80, "KeyH"),
      down(150, "KeyO"),
      input(151, "o"),
      up(210, "KeyO"),
      input(400, " "),
    ];
    expect(rhythmOf(events)).toEqual({ intervalsMs: [150, 249], holdsMs: [80, 60] });
  });

  it("con teclado táctil (sin down/up) solo hay intervalos", () => {
    expect(rhythmOf([input(10, "a"), input(130, "b"), input(260, "c")])).toEqual({
      intervalsMs: [120, 130],
      holdsMs: [],
    });
  });

  it("una tecla mantenida (down repetido) cuenta desde el primer down; un up sin down no cuenta", () => {
    const events = [up(5, "KeyX"), down(10, "KeyA"), down(40, "KeyA"), down(70, "KeyA"), up(100, "KeyA")];
    expect(rhythmOf(events).holdsMs).toEqual([90]);
  });

  it("un t negativo cuenta como 0, y un t que retrocede no da tiempos negativos", () => {
    expect(rhythmOf([input(-50, "a"), input(30, "b"), input(10, "c")]).intervalsMs).toEqual([30, 0]);
    expect(rhythmOf([down(100, "KeyA"), up(90, "KeyA")]).holdsMs).toEqual([0]);
  });

  it("salta lo que no es un evento: sin type, sin t numérico, null o texto suelto", () => {
    const events = [null, "x", { type: "input" }, { t: "1", type: "input" }, { t: Number.NaN, type: "input" }, input(5, "a"), input(25, "b")];
    expect(rhythmOf(events)).toEqual({ intervalsMs: [20], holdsMs: [] });
  });

  it("un t enorme no da tiempos mayores que el tope (cabrían mal en un integer)", () => {
    const rhythm = rhythmOf([down(0, "KeyA"), input(1, "a"), up(3e9, "KeyA"), input(3e9, "b")]);
    expect(rhythm).toEqual({ intervalsMs: [MAX_RHYTHM_MS], holdsMs: [MAX_RHYTHM_MS] });
  });

  it("las pulsaciones con code vacío no dan duraciones, pero los input siguen dando intervalos", () => {
    const events = [down(0, ""), down(10, ""), input(20, "a"), up(50, ""), input(60, "b"), up(80, "")];
    expect(rhythmOf(events)).toEqual({ intervalsMs: [40], holdsMs: [] });
  });

  it("sin eventos, ritmo vacío", () => {
    expect(rhythmOf([])).toEqual({ intervalsMs: [], holdsMs: [] });
  });
});

describe("weekOf", () => {
  it("el lunes (UTC) de la semana de la partida", () => {
    expect(weekOf(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-05"); // jueves
    expect(weekOf(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05"); // lunes
    expect(weekOf(new Date("2026-10-11T23:59:59Z"))).toBe("2026-10-05"); // domingo
    expect(weekOf(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-28"); // la semana cruza el año
  });
});
