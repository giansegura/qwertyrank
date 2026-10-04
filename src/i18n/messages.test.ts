import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("mensajes", () => {
  it.each([
    ["es", es],
    ["pt", pt],
  ])("%s tiene exactamente las mismas claves que en", (_, messages) => {
    expect(keys(messages).toSorted()).toEqual(keys(en).toSorted());
  });

  it.each([
    ["en", en],
    ["es", es],
    ["pt", pt],
  ])("%s no tiene textos vacíos", (_, messages) => {
    const empty = keys(messages).filter((path) => {
      const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
      return typeof value !== "string" || value.trim() === "";
    });
    expect(empty).toEqual([]);
  });

  it.each([
    ["en", en],
    ["es", es],
    ["pt", pt],
  ])("%s llama \"Ranked\" al modo competitivo (mismo nombre en todos los idiomas)", (_, messages) => {
    expect(messages.Nav.home).toBe("Ranked");
  });
});
