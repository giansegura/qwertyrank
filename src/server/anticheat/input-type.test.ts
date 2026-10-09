import { describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { DEV_ANTICHEAT_CONFIG as C } from "./config";
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
  it("physical keyboard: real keys held down", () => {
    expect(classifyInputType(typed("hola mundo azul casa"), DESKTOP, C)).toBe("physical");
  });

  it("Android keyboard: 'Unidentified' keys", () => {
    expect(classifyInputType(androidIme("hola mundo azul"), PHONE, C)).toBe("touch");
  });

  it("near-instant keystrokes (virtual keyboard): touch", () => {
    expect(classifyInputType(typed("hola mundo azul casa", { hold: 3 }), PHONE, C)).toBe("touch");
  });

  it("if it claims touch but types like a physical keyboard, it is physical", () => {
    expect(classifyInputType(typed("hola mundo azul casa"), PHONE, C)).toBe("physical");
  });

  it("with few keystrokes it decides from the browser signals", () => {
    expect(classifyInputType(typed("hola"), PHONE, C)).toBe("touch");
    expect(classifyInputType(typed("hola"), DESKTOP, C)).toBe("physical");
    expect(classifyInputType(inputOnly("hola mundo azul casa"), PHONE, C)).toBe("touch");
  });
});

describe("configuration", () => {
  it("the key hold threshold comes from the configuration", () => {
    const events = typed("hola mundo azul casa", { hold: 15 });
    expect(classifyInputType(events, PHONE, { ...C, physicalMinHoldMs: 10 })).toBe("physical");
    expect(classifyInputType(events, PHONE, { ...C, physicalMinHoldMs: 20 })).toBe("touch");
  });
});
