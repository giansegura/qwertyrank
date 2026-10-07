// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../db/client";
import {
  decideReview,
  exceedsVerifiedLevel,
  openVisibleBoards,
  reviewRanks,
  shouldReview,
  type BoardStanding,
  type ReviewCandidate,
} from "./review";

const SCORE = 1_000;
const board = (period: BoardStanding["period"], ahead: number, ownScore: number | null = null): BoardStanding => ({
  period,
  ahead,
  ownScore,
});

describe("rankings abiertos", () => {
  it("una partida de antes de medianoche ya no cuenta para el día de hoy; siempre está abierto", () => {
    const lastNight = new Date("2026-10-06T23:59:30Z");
    const now = new Date("2026-10-07T00:00:05Z");
    expect(openVisibleBoards(lastNight, now)).toEqual([
      { period: "week", key: "2026-W41" },
      { period: "month", key: "2026-10" },
      { period: "all", key: "all" },
    ]);
    expect(openVisibleBoards(now, now).map((open) => open.period)).toEqual(["day", "week", "month", "all"]);
  });
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
  it("entra en review si quedaría entre los 10 primeros de algún ranking abierto", () => {
    expect(shouldReview(SCORE, 80, { boards: [board("day", 9), board("all", 500)], verifiedWpm: null })).toBe(true);
    expect(shouldReview(SCORE, 80, { boards: [board("day", 10), board("all", 500)], verifiedWpm: null })).toBe(false);
  });

  it("solo donde mejora su propia marca", () => {
    const better = { boards: [board("day", 0, SCORE + 1), board("all", 50, SCORE + 1)], verifiedWpm: null };
    expect(shouldReview(SCORE, 80, better)).toBe(false);
    const worse = { boards: [board("day", 3, SCORE - 1), board("all", 50, SCORE + 1)], verifiedWpm: null };
    expect(shouldReview(SCORE, 80, worse)).toBe(true);
  });

  it("con nivel verificado, dentro del 110 % no se verifica aunque quede primero", () => {
    expect(shouldReview(SCORE, 105, { boards: [board("day", 0)], verifiedWpm: 100 })).toBe(false);
    expect(shouldReview(SCORE, 111, { boards: [board("day", 0)], verifiedWpm: 100 })).toBe(true);
  });

  it("las posiciones son los que tiene por delante más uno, solo en los rankings abiertos", () => {
    expect(reviewRanks([board("week", 2), board("all", 40)])).toEqual({ week: 3, all: 41 });
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
    const now = new Date();
    expect(await decideReview(untouchable, { ...game, userId: null }, now)).toBeNull();
    expect(await decideReview(untouchable, { ...game, verdict: "rejected" }, now)).toBeNull();
    expect(await decideReview(untouchable, { ...game, accuracy: 89.99 }, now)).toBeNull();
  });
});
