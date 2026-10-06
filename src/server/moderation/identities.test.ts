// @vitest-environment node
import { describe, expect, it } from "vitest";
import { identityHash, normalizeEmail } from "./identities";

const SECRET = "s".repeat(32);

describe("identidades baneadas", () => {
  it("normaliza el email: minúsculas, sin +etiqueta y, en Gmail, sin puntos", () => {
    expect(normalizeEmail("  Ana.Lopez+juegos@Example.com ")).toBe("ana.lopez@example.com");
    expect(normalizeEmail("Ana.Lopez+x@googlemail.com")).toBe("analopez@gmail.com");
    expect(normalizeEmail("a.b@gmail.com")).toBe("ab@gmail.com");
  });

  it("el hash es el mismo para los alias y distinto entre clases y entre secretos", () => {
    expect(identityHash("email", "A.B+1@gmail.com", SECRET)).toBe(identityHash("email", "ab@googlemail.com", SECRET));
    expect(identityHash("email", "123@x.com", SECRET)).not.toBe(identityHash("google", "123@x.com", SECRET));
    expect(identityHash("email", "ab@gmail.com", SECRET)).not.toBe(identityHash("email", "ab@gmail.com", "t".repeat(32)));
    expect(identityHash("google", "1234", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });
});
