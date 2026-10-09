import { describe, expect, it } from "vitest";
import { diffInput, isDeadKeyPreview } from "./input-diff";

describe("diffInput", () => {
  it("detects an added letter", () => {
    expect(diffInput("hol", "hola")).toEqual({ deleted: 0, inserted: "a" });
  });

  it("detects a deletion", () => {
    expect(diffInput("hola", "hol")).toEqual({ deleted: 1, inserted: "" });
  });

  it("detects a replacement (autocorrect or composition)", () => {
    expect(diffInput("cosa", "casa")).toEqual({ deleted: 3, inserted: "asa" });
  });

  it("with no changes returns an empty diff", () => {
    expect(diffInput("hola", "hola")).toEqual({ deleted: 0, inserted: "" });
  });
});

describe("isDeadKeyPreview", () => {
  it("ignores the standalone accent while composing", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "´" }, true)).toBe(true);
    expect(isDeadKeyPreview({ deleted: 0, inserted: "~" }, true)).toBe(true);
  });

  it("does not ignore the final composed letter", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "é" }, true)).toBe(false);
  });

  it("ignores nothing when not composing", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "´" }, false)).toBe(false);
  });

  it("after a dead key ignores the standalone character it shows (US-International uses ' and \")", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "'" }, true, true)).toBe(true);
    expect(isDeadKeyPreview({ deleted: 0, inserted: '"' }, true, true)).toBe(true);
  });

  it("without a previous dead key, a composed apostrophe does count", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "'" }, true, false)).toBe(false);
  });

  it("after a dead key does not ignore more than one character", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "'a" }, true, true)).toBe(false);
  });
});
