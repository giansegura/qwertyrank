import { describe, expect, it } from "vitest";
import { keysBodySchema, startBodySchema } from "./schemas";

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

describe("startBodySchema", () => {
  const ranked = { language: "es", env: { coarse: false, touchPoints: 0 } };
  const id = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

  it("sin modo es una partida Ranked, como hasta ahora", () => {
    expect(startBodySchema.parse(ranked)).toEqual(ranked);
    expect(startBodySchema.parse({ ...ranked, mode: "ranked" }).mode).toBe("ranked");
  });

  it("una verificación dice cuál, con un UUID", () => {
    expect(startBodySchema.parse({ ...ranked, mode: "verification", verificationId: id })).toMatchObject({
      mode: "verification",
      verificationId: id,
    });
    expect(startBodySchema.safeParse({ ...ranked, mode: "verification" }).success).toBe(false);
    expect(startBodySchema.safeParse({ ...ranked, mode: "verification", verificationId: "abc" }).success).toBe(false);
    expect(startBodySchema.safeParse({ ...ranked, mode: "practice" }).success).toBe(false);
  });
});
