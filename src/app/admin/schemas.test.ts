// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dismissInput, nickInput, statusInput } from "./schemas";

const ID = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

describe("entradas de las acciones del panel", () => {
  it("el motivo va de 1 a 500 caracteres, sin contar espacios de los bordes", () => {
    const status = (reason: string) => statusInput.safeParse({ playerId: ID, status: "banned", reason }).success;
    expect(status("")).toBe(false);
    expect(status("   \n\t ")).toBe(false);
    expect(status("a".repeat(500))).toBe(true);
    expect(status("a".repeat(501))).toBe(false);
    expect(nickInput.safeParse({ playerId: ID, reason: "x".repeat(501) }).success).toBe(false);
    expect(nickInput.safeParse({ playerId: ID, reason: " ok " }).data?.reason).toBe("ok");
  });

  it("playerId debe ser un UUID", () => {
    expect(statusInput.safeParse({ playerId: "no-uuid", status: "banned", reason: "x" }).success).toBe(false);
    expect(nickInput.safeParse({ playerId: "1", reason: "x" }).success).toBe(false);
    expect(dismissInput.safeParse({ playerId: "../etc" }).success).toBe(false);
    expect(dismissInput.safeParse({ playerId: ID }).success).toBe(true);
  });

  it("el estado solo puede ser uno de los tres conocidos", () => {
    expect(statusInput.safeParse({ playerId: ID, status: "deleted", reason: "x" }).success).toBe(false);
    expect(statusInput.safeParse({ playerId: ID, reason: "x" }).success).toBe(false);
    for (const status of ["active", "shadowbanned", "banned"]) {
      expect(statusInput.safeParse({ playerId: ID, status, reason: "x" }).success).toBe(true);
    }
  });
});
