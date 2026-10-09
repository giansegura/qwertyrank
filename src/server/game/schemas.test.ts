import { describe, expect, it } from "vitest";
import { keysBodySchema, startBodySchema } from "./schemas";

const event = { t: 0, type: "input", deleted: 0, inserted: "a", trusted: true };

describe("keysBodySchema", () => {
  it("accepts a normal batch", () => {
    expect(keysBodySchema.safeParse({ seq: 1, events: [event] }).success).toBe(true);
  });

  it("limits the number of batches in a game", () => {
    expect(keysBodySchema.safeParse({ seq: 30, events: [] }).success).toBe(true);
    expect(keysBodySchema.safeParse({ seq: 31, events: [] }).success).toBe(false);
  });

  it("limits the events in each batch", () => {
    expect(keysBodySchema.safeParse({ seq: 1, events: Array(1_000).fill(event) }).success).toBe(true);
    expect(keysBodySchema.safeParse({ seq: 1, events: Array(1_001).fill(event) }).success).toBe(false);
  });
});

describe("startBodySchema", () => {
  const ranked = { language: "es", env: { coarse: false, touchPoints: 0 } };
  const id = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

  it("without a mode it is a Ranked game, as before", () => {
    expect(startBodySchema.parse(ranked)).toEqual(ranked);
    expect(startBodySchema.parse({ ...ranked, mode: "ranked" }).mode).toBe("ranked");
  });

  it("a verification says which one, with a UUID", () => {
    expect(startBodySchema.parse({ ...ranked, mode: "verification", verificationId: id })).toMatchObject({
      mode: "verification",
      verificationId: id,
    });
    expect(startBodySchema.safeParse({ ...ranked, mode: "verification" }).success).toBe(false);
    expect(startBodySchema.safeParse({ ...ranked, mode: "verification", verificationId: "abc" }).success).toBe(false);
    expect(startBodySchema.safeParse({ ...ranked, mode: "practice" }).success).toBe(false);
  });
});
