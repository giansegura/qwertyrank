// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HUMAN_PASS_SECONDS, isValidHumanPass, issueHumanPass } from "./human-pass";

const SECRET = "s".repeat(32);
const NOW = new Date("2026-10-06T12:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("pase humano", () => {
  it("vale para el mismo anónimo durante una hora", () => {
    const pass = issueHumanPass("anon-1", SECRET, NOW);
    expect(isValidHumanPass(pass, "anon-1", SECRET, later(HUMAN_PASS_SECONDS - 1))).toBe(true);
    expect(isValidHumanPass(pass, "anon-1", SECRET, later(HUMAN_PASS_SECONDS))).toBe(false);
  });

  it("no vale para otro anónimo ni con otro secreto", () => {
    const pass = issueHumanPass("anon-1", SECRET, NOW);
    expect(isValidHumanPass(pass, "anon-2", SECRET, NOW)).toBe(false);
    expect(isValidHumanPass(pass, "anon-1", "t".repeat(32), NOW)).toBe(false);
  });

  it("rechaza pases manipulados o mal formados", () => {
    const pass = issueHumanPass("anon-1", SECRET, NOW);
    const [exp, signature] = pass.split(".");
    expect(isValidHumanPass(`${Number(exp) + 3600}.${signature}`, "anon-1", SECRET, NOW)).toBe(false);
    for (const bad of [undefined, "", "abc", ".x", "123", `x.${signature}`]) {
      expect(isValidHumanPass(bad, "anon-1", SECRET, NOW)).toBe(false);
    }
  });
});
