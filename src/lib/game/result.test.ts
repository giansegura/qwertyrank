import { describe, expect, it } from "vitest";
import { isGameId, resultFromJson } from "./result";

describe("isGameId", () => {
  it("acepta un UUID en minúsculas", () => {
    expect(isGameId("3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f")).toBe(true);
  });

  it("rechaza texto, vacío, rutas y UUID en mayúsculas", () => {
    for (const value of ["hola", "", "../x", "3F6C1E2A-9B4D-4C8E-A1F2-0D9E8B7C6A5F"]) {
      expect(isGameId(value)).toBe(false);
    }
  });
});

describe("resultFromJson", () => {
  it("convierte la fecha", () => {
    const result = resultFromJson({
      id: "g1",
      language: "es",
      inputType: "physical",
      wpm: 80,
      accuracy: 97,
      startsAt: "2026-10-02T10:00:00.000Z",
      player: null,
    });
    expect(result.startsAt).toEqual(new Date("2026-10-02T10:00:00.000Z"));
  });
});
