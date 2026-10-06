import { describe, expect, it } from "vitest";
import { checkNick, findFreeNick, nickBase } from "./nick";

describe("checkNick", () => {
  it("acepta 3–20 letras, números o _", () => {
    expect(checkNick("gian_42")).toBeNull();
    expect(checkNick("ABC")).toBeNull();
    expect(checkNick("a".repeat(20))).toBeNull();
  });

  it("rechaza longitudes y caracteres fuera del formato", () => {
    expect(checkNick("ab")).toBe("invalid");
    expect(checkNick("a".repeat(21))).toBe("invalid");
    expect(checkNick("gian marco")).toBe("invalid");
    expect(checkNick("gián")).toBe("invalid");
    expect(checkNick("gian-42")).toBe("invalid");
  });

  it("rechaza palabrotas", () => {
    expect(checkNick("sh1t_lord")).toBe("profane");
  });
});

describe("nickBase", () => {
  it("usa la primera palabra del nombre, sin tildes, en minúsculas", () => {
    expect(nickBase("x@example.com", "José Álvarez")).toBe("jose");
  });

  it("sin nombre, usa la primera palabra del email (no el email entero)", () => {
    expect(nickBase("gianmarco.segura@example.com", "")).toBe("gianmarco");
  });

  it("corta a 12 caracteres", () => {
    expect(nickBase("abcdefghijklmnopqrstuvwxyz@example.com", "")).toBe("abcdefghijkl");
  });

  it("si la palabra es demasiado corta o es una palabrota, usa player", () => {
    expect(nickBase("ab@example.com", "")).toBe("player");
    expect(nickBase("x@example.com", "Puta")).toBe("player");
  });
});

describe("findFreeNick", () => {
  it("añade dos cifras a la base", async () => {
    expect(await findFreeNick("gian", async () => false, () => 0.42)).toBe("gian_42");
  });

  it("si está ocupado, prueba otras cifras", async () => {
    const values = [0.42, 0.07];
    const taken = new Set(["gian_42"]);
    expect(await findFreeNick("gian", async (nick) => taken.has(nick), () => values.shift() ?? 0)).toBe("gian_07");
  });

  it("tras seis intentos ocupados pasa a cuatro cifras", async () => {
    const tried: string[] = [];
    const nick = await findFreeNick(
      "gian",
      async (candidate) => {
        tried.push(candidate);
        return tried.length <= 6;
      },
      () => 0.1234,
    );
    expect(nick).toBe("gian_1234");
  });

  it("si no encuentra ninguno libre, falla", async () => {
    await expect(findFreeNick("gian", async () => true, () => 0.5)).rejects.toThrow();
  });
});
