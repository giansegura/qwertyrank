import { describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { classifyInputType } from "./input-type";
import { inputOnly, typed } from "@/test/typing-events";

const DESKTOP = { coarse: false, touchPoints: 0 };
const PHONE = { coarse: true, touchPoints: 5 };

function androidIme(text: string): TypingEvent[] {
  return [...text].flatMap((char, i) => [
    { t: i * 200, type: "down" as const, key: "Unidentified", code: "", trusted: true },
    { t: i * 200 + 1, type: "input" as const, deleted: 0, inserted: char, trusted: true },
    { t: i * 200 + 2, type: "up" as const, key: "Unidentified", code: "", trusted: true },
  ]);
}

describe("classifyInputType", () => {
  it("teclado físico: teclas reales mantenidas pulsadas", () => {
    expect(classifyInputType(typed("hola mundo azul casa"), DESKTOP)).toBe("physical");
  });

  it("teclado de Android: teclas 'Unidentified'", () => {
    expect(classifyInputType(androidIme("hola mundo azul"), PHONE)).toBe("touch");
  });

  it("pulsaciones casi instantáneas (teclado virtual): táctil", () => {
    expect(classifyInputType(typed("hola mundo azul casa", { hold: 3 }), PHONE)).toBe("touch");
  });

  it("si dice ser táctil pero teclea como un teclado físico, es físico", () => {
    expect(classifyInputType(typed("hola mundo azul casa"), PHONE)).toBe("physical");
  });

  it("con pocas pulsaciones decide por las señales del navegador", () => {
    expect(classifyInputType(typed("hola"), PHONE)).toBe("touch");
    expect(classifyInputType(typed("hola"), DESKTOP)).toBe("physical");
    expect(classifyInputType(inputOnly("hola mundo azul casa"), PHONE)).toBe("touch");
  });
});
