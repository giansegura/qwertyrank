import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("messages", () => {
  it.each([
    ["es", es],
    ["pt", pt],
  ])("%s has exactly the same keys as en", (_, messages) => {
    expect(keys(messages).toSorted()).toEqual(keys(en).toSorted());
  });

  it.each([
    ["en", en],
    ["es", es],
    ["pt", pt],
  ])("%s has no empty texts", (_, messages) => {
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
  ])("%s calls the competitive mode \"Ranked\" (same name in every language)", (_, messages) => {
    expect(messages.Nav.home).toBe("Ranked");
  });
});
