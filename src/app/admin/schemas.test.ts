// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dismissInput, nickInput, statusInput } from "./schemas";

const ID = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

describe("panel action inputs", () => {
  it("the reason is 1 to 500 characters, not counting leading and trailing whitespace", () => {
    const status = (reason: string) => statusInput.safeParse({ playerId: ID, status: "banned", reason }).success;
    expect(status("")).toBe(false);
    expect(status("   \n\t ")).toBe(false);
    expect(status("a".repeat(500))).toBe(true);
    expect(status("a".repeat(501))).toBe(false);
    expect(nickInput.safeParse({ playerId: ID, reason: "x".repeat(501) }).success).toBe(false);
    expect(nickInput.safeParse({ playerId: ID, reason: " ok " }).data?.reason).toBe("ok");
  });

  it("playerId must be a UUID", () => {
    expect(statusInput.safeParse({ playerId: "no-uuid", status: "banned", reason: "x" }).success).toBe(false);
    expect(nickInput.safeParse({ playerId: "1", reason: "x" }).success).toBe(false);
    expect(dismissInput.safeParse({ playerId: "../etc" }).success).toBe(false);
    expect(dismissInput.safeParse({ playerId: ID }).success).toBe(true);
  });

  it("the status can only be one of the three known ones", () => {
    expect(statusInput.safeParse({ playerId: ID, status: "deleted", reason: "x" }).success).toBe(false);
    expect(statusInput.safeParse({ playerId: ID, reason: "x" }).success).toBe(false);
    for (const status of ["active", "shadowbanned", "banned"]) {
      expect(statusInput.safeParse({ playerId: ID, status, reason: "x" }).success).toBe(true);
    }
  });
});
