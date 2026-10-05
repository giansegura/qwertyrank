import { describe, expect, it } from "vitest";
import { keysBodySchema } from "./schemas";

const event = { t: 0, type: "input", deleted: 0, inserted: "a", trusted: true };

describe("keysBodySchema", () => {
  it("acepta una tanda normal", () => {
    expect(keysBodySchema.safeParse({ seq: 1, events: [event] }).success).toBe(true);
  });

  it("limita el número de tandas de una partida", () => {
    expect(keysBodySchema.safeParse({ seq: 30, events: [] }).success).toBe(true);
    expect(keysBodySchema.safeParse({ seq: 31, events: [] }).success).toBe(false);
  });

  it("limita los eventos de cada tanda", () => {
    expect(keysBodySchema.safeParse({ seq: 1, events: Array(1_000).fill(event) }).success).toBe(true);
    expect(keysBodySchema.safeParse({ seq: 1, events: Array(1_001).fill(event) }).success).toBe(false);
  });
});
