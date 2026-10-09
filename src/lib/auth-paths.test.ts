import { describe, expect, it } from "vitest";
import { firstParam, loginPath, safeNext, welcomePath } from "./auth-paths";

describe("safeNext", () => {
  it("accepts own routes in the same language", () => {
    expect(safeNext("es", "/es/practica")).toBe("/es/practica");
    expect(safeNext("es", "/es")).toBe("/es");
    expect(safeNext("es", "/es?x=1")).toBe("/es?x=1");
  });

  it("anything else goes back to the home page: prevents open redirects", () => {
    expect(safeNext("es", "https://evil.example")).toBe("/es");
    expect(safeNext("es", "//evil.example")).toBe("/es");
    expect(safeNext("es", "/es\\evil")).toBe("/es");
    expect(safeNext("es", "/en/practice")).toBe("/es");
    expect(safeNext("es", "/esx")).toBe("/es");
    expect(safeNext("es", undefined)).toBe("/es");
  });
});

describe("account routes", () => {
  it("sign in, with the return route", () => {
    expect(loginPath("en")).toBe("/en/sign-in");
    expect(loginPath("es", "/es/practica")).toBe("/es/entrar?next=%2Fes%2Fpractica");
  });

  it("welcome after creating the account", () => {
    expect(welcomePath("pt", "/pt")).toBe("/pt/configuracoes?welcome=1&next=%2Fpt");
  });

  it("firstParam keeps the first value", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
