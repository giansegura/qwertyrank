import { describe, expect, it } from "vitest";
import { firstParam, loginPath, safeNext, welcomePath } from "./auth-paths";

describe("safeNext", () => {
  it("acepta rutas propias del mismo idioma", () => {
    expect(safeNext("es", "/es/practica")).toBe("/es/practica");
    expect(safeNext("es", "/es")).toBe("/es");
    expect(safeNext("es", "/es?x=1")).toBe("/es?x=1");
  });

  it("cualquier otra cosa vuelve a la portada: evita redirecciones abiertas", () => {
    expect(safeNext("es", "https://evil.example")).toBe("/es");
    expect(safeNext("es", "//evil.example")).toBe("/es");
    expect(safeNext("es", "/es\\evil")).toBe("/es");
    expect(safeNext("es", "/en/practice")).toBe("/es");
    expect(safeNext("es", "/esx")).toBe("/es");
    expect(safeNext("es", undefined)).toBe("/es");
  });
});

describe("rutas de cuenta", () => {
  it("entrar, con la ruta de vuelta", () => {
    expect(loginPath("en")).toBe("/en/sign-in");
    expect(loginPath("es", "/es/practica")).toBe("/es/entrar?next=%2Fes%2Fpractica");
  });

  it("bienvenida tras crear la cuenta", () => {
    expect(welcomePath("pt", "/pt")).toBe("/pt/configuracoes?welcome=1&next=%2Fpt");
  });

  it("firstParam se queda con el primer valor", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
