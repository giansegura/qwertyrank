// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../db/client";
import { decideReview, exceedsVerifiedLevel, shouldReview, type ReviewCandidate, type Standing } from "./review";

const SCORE = 1_000;
const standing = (ahead: number, ownScore: number | null = null, verifiedWpm: number | null = null): Standing => ({
  ahead,
  ownScore,
  verifiedWpm,
});

describe("nivel verificado", () => {
  it("sin nivel cuenta cualquier PPM; con nivel, solo lo que pasa del 110 %", () => {
    expect(exceedsVerifiedLevel(30, null)).toBe(true);
    expect(exceedsVerifiedLevel(110, 100)).toBe(false);
    expect(exceedsVerifiedLevel(110.01, 100)).toBe(true);
    expect(exceedsVerifiedLevel(66, 60)).toBe(false);
  });
});

describe("decisión de review", () => {
  it("entra en review si quedaría entre los 10 primeros de su ranking", () => {
    expect(shouldReview(SCORE, 80, standing(9))).toBe(true);
    expect(shouldReview(SCORE, 80, standing(10))).toBe(false);
  });

  it("solo si mejora su propia marca", () => {
    expect(shouldReview(SCORE, 80, standing(0, SCORE + 1))).toBe(false);
    expect(shouldReview(SCORE, 80, standing(0, SCORE))).toBe(false);
    expect(shouldReview(SCORE, 80, standing(3, SCORE - 1))).toBe(true);
  });

  it("con nivel verificado, dentro del 110 % no se verifica aunque quede primero", () => {
    expect(shouldReview(SCORE, 105, standing(0, null, 100))).toBe(false);
    expect(shouldReview(SCORE, 111, standing(0, null, 100))).toBe(true);
  });

  it("sin cuenta, no válida o por debajo del 90 % de precisión no consulta nada", async () => {
    const untouchable = new Proxy({}, {
      get() {
        throw new Error("no debería consultar la base de datos");
      },
    }) as DbExecutor;
    const game: ReviewCandidate = {
      userId: "u1",
      language: "en",
      inputType: "physical",
      verdict: "valid",
      wpm: 200,
      accuracy: 99,
      startsAt: new Date(),
    };
    expect(await decideReview(untouchable, { ...game, userId: null })).toBeNull();
    expect(await decideReview(untouchable, { ...game, verdict: "rejected" })).toBeNull();
    expect(await decideReview(untouchable, { ...game, accuracy: 89.99 })).toBeNull();
  });
});
