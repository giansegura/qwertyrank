import { describe, expect, it } from "vitest";
import { diffInput, isDeadKeyPreview } from "./input-diff";

describe("diffInput", () => {
  it("detecta una letra añadida", () => {
    expect(diffInput("hol", "hola")).toEqual({ deleted: 0, inserted: "a" });
  });

  it("detecta un borrado", () => {
    expect(diffInput("hola", "hol")).toEqual({ deleted: 1, inserted: "" });
  });

  it("detecta un reemplazo (autocorrector o composición)", () => {
    expect(diffInput("cosa", "casa")).toEqual({ deleted: 3, inserted: "asa" });
  });

  it("sin cambios devuelve un diff vacío", () => {
    expect(diffInput("hola", "hola")).toEqual({ deleted: 0, inserted: "" });
  });
});

describe("isDeadKeyPreview", () => {
  it("ignora el acento suelto mientras se compone", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "´" }, true)).toBe(true);
    expect(isDeadKeyPreview({ deleted: 0, inserted: "~" }, true)).toBe(true);
  });

  it("no ignora la letra compuesta final", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "é" }, true)).toBe(false);
  });

  it("no ignora nada si no se está componiendo", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "´" }, false)).toBe(false);
  });

  it("tras una tecla muerta ignora el carácter suelto que muestra (US-Internacional usa ' y \")", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "'" }, true, true)).toBe(true);
    expect(isDeadKeyPreview({ deleted: 0, inserted: '"' }, true, true)).toBe(true);
  });

  it("sin tecla muerta previa, un apóstrofo compuesto sí cuenta", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "'" }, true, false)).toBe(false);
  });

  it("tras una tecla muerta no ignora más de un carácter", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "'a" }, true, true)).toBe(false);
  });
});
