import { describe, expect, it } from "vitest";
import { checkNick, findFreeNick, nickBase } from "./nick";

describe("checkNick", () => {
  it("accepts 3–20 letters, digits or _", () => {
    expect(checkNick("gian_42")).toBeNull();
    expect(checkNick("ABC")).toBeNull();
    expect(checkNick("a".repeat(20))).toBeNull();
  });

  it("rejects lengths and characters outside the format", () => {
    expect(checkNick("ab")).toBe("invalid");
    expect(checkNick("a".repeat(21))).toBe("invalid");
    expect(checkNick("gian marco")).toBe("invalid");
    expect(checkNick("gián")).toBe("invalid");
    expect(checkNick("gian-42")).toBe("invalid");
  });

  it("rejects swear words", () => {
    expect(checkNick("sh1t_lord")).toBe("profane");
  });
});

describe("nickBase", () => {
  it("uses the first word of the name, without accents, in lowercase", () => {
    expect(nickBase("x@example.com", "José Álvarez")).toBe("jose");
  });

  it("without a name, uses the first word of the email (not the whole email)", () => {
    expect(nickBase("gianmarco.segura@example.com", "")).toBe("gianmarco");
  });

  it("cuts to 12 characters", () => {
    expect(nickBase("abcdefghijklmnopqrstuvwxyz@example.com", "")).toBe("abcdefghijkl");
  });

  it("if the word is too short or is a swear word, uses player", () => {
    expect(nickBase("ab@example.com", "")).toBe("player");
    expect(nickBase("x@example.com", "Puta")).toBe("player");
  });
});

describe("findFreeNick", () => {
  it("appends two digits to the base", async () => {
    expect(await findFreeNick("gian", async () => false, () => 0.42)).toBe("gian_42");
  });

  it("if it is taken, tries other digits", async () => {
    const values = [0.42, 0.07];
    const taken = new Set(["gian_42"]);
    expect(await findFreeNick("gian", async (nick) => taken.has(nick), () => values.shift() ?? 0)).toBe("gian_07");
  });

  it("after six taken attempts it switches to four digits", async () => {
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

  it("if it finds none free, it fails", async () => {
    await expect(findFreeNick("gian", async () => true, () => 0.5)).rejects.toThrow();
  });
});
