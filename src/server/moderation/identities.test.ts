// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { identityHash, normalizeEmail } from "./identities";

const SECRET = "s".repeat(32);
const FIXED_GOOGLE_1234 = "5f30376c3a8a6200c7a6d0a4674c3561aae14c080806e42d807176b7f90ddec1";

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

  it("la construcción del hash no cambia (vector independiente): si cambia, los baneos guardados dejan de valer", () => {
    const key = createHmac("sha256", SECRET).update("banned-identity").digest();
    const expected = (message: string) => createHmac("sha256", key).update(message).digest("hex");
    expect(identityHash("email", "  Ana.Lopez+x@Example.com ", SECRET)).toBe(expected("ana.lopez@example.com"));
    expect(identityHash("google", "1234", SECRET)).toBe(expected("google:1234"));
    // Valor fijo calculado una vez: protege también de un cambio simultáneo en código y test.
    expect(identityHash("google", "1234", SECRET)).toBe(FIXED_GOOGLE_1234);
  });
});
