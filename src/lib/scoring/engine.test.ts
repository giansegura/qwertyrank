import { describe, expect, it } from "vitest";
import { MAX_EXTRA_CHARS, applyInput, createEngine, isFinished } from "./engine";

function type(words: string[], ...chunks: string[]) {
  return chunks.reduce((state, chunk) => applyInput(state, 0, chunk), createEngine(words));
}

describe("engine", () => {
  it("empieza en la primera palabra sin nada escrito", () => {
    const state = createEngine(["hola", "mundo"]);
    expect(state.current).toBe(0);
    expect(state.typed).toEqual([""]);
    expect(isFinished(state)).toBe(false);
  });

  it("cuenta las letras correctas y avanza con el espacio", () => {
    const state = type(["hola", "mundo"], "hola ");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
    expect(state.correctInserts).toBe(5);
    expect(state.totalInserts).toBe(5);
  });

  it("registra el carácter esperado como fallo cuando se escribe otro", () => {
    const state = type(["casa"], "cosa");
    expect(state.correctInserts).toBe(3);
    expect(state.totalInserts).toBe(4);
    expect(state.mistakes).toEqual({ a: 1 });
  });

  it("el espacio de una palabra incorrecta cuenta como pulsación incorrecta", () => {
    const state = type(["casa", "azul"], "cosa ");
    expect(state.current).toBe(1);
    expect(state.totalInserts).toBe(5);
    expect(state.correctInserts).toBe(3);
  });

  it("ignora un espacio al inicio de palabra (doble espacio)", () => {
    const state = type(["hola", "mundo"], " ", "hola  ");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
    expect(state.totalInserts).toBe(5);
  });

  it("acepta cualquier espacio en blanco como espacio (p. ej. NBSP de teclados móviles)", () => {
    const state = type(["hola", "mundo"], "hola ");
    expect(state.current).toBe(1);
    expect(state.correctInserts).toBe(5);
  });

  it("cuenta como incorrectos los caracteres de más, hasta un máximo", () => {
    const state = type(["sol"], "sol" + "x".repeat(MAX_EXTRA_CHARS + 5));
    expect(state.typed[0]).toBe("sol" + "x".repeat(MAX_EXTRA_CHARS));
    expect(state.totalInserts).toBe(3 + MAX_EXTRA_CHARS);
    expect(state.mistakes).toEqual({});
  });

  it("borra solo dentro de la palabra actual", () => {
    let state = type(["hola", "mundo"], "hola ", "mu");
    state = applyInput(state, 5, "");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
  });

  it("borrar y volver a escribir corrige la palabra, pero los fallos siguen contando", () => {
    let state = type(["gato"], "gatp");
    state = applyInput(state, 1, "o");
    expect(state.typed[0]).toBe("gato");
    expect(state.totalInserts).toBe(5);
    expect(state.correctInserts).toBe(4);
    expect(state.mistakes).toEqual({ o: 1 });
  });

  it("una mayúscula no coincide con la minúscula esperada", () => {
    const state = type(["casa"], "Casa");
    expect(state.mistakes).toEqual({ c: 1 });
  });

  it("procesa varios caracteres de golpe, incluidos espacios", () => {
    const state = type(["uno", "dos", "tres"], "uno dos t");
    expect(state.current).toBe(2);
    expect(state.typed).toEqual(["uno", "dos", "t"]);
  });

  it("termina al confirmar la última palabra e ignora lo que llegue después", () => {
    const finished = type(["fin"], "fin ");
    expect(isFinished(finished)).toBe(true);
    expect(applyInput(finished, 0, "abc")).toBe(finished);
  });

  it("ignora un número de borrados no válido", () => {
    const state = applyInput(type(["hola"], "ho"), Number.NaN, "l");
    expect(state.typed[0]).toBe("hol");
  });

  it("no modifica el estado anterior", () => {
    const before = type(["hola"], "h");
    applyInput(before, 0, "o");
    expect(before.typed).toEqual(["h"]);
  });
});
