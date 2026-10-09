// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { identityHash, normalizeEmail } from "./identities";

const SECRET = "s".repeat(32);
const FIXED_GOOGLE_1234 = "5f30376c3a8a6200c7a6d0a4674c3561aae14c080806e42d807176b7f90ddec1";

describe("banned identities", () => {
  it("normalizes the email: lowercase, without +tag and, on Gmail, without dots", () => {
    expect(normalizeEmail("  Ana.Lopez+games@Example.com ")).toBe("ana.lopez@example.com");
    expect(normalizeEmail("Ana.Lopez+x@googlemail.com")).toBe("analopez@gmail.com");
    expect(normalizeEmail("a.b@gmail.com")).toBe("ab@gmail.com");
  });

  it("the hash is the same for aliases and differs between kinds and between secrets", () => {
    expect(identityHash("email", "A.B+1@gmail.com", SECRET)).toBe(identityHash("email", "ab@googlemail.com", SECRET));
    expect(identityHash("email", "123@x.com", SECRET)).not.toBe(identityHash("google", "123@x.com", SECRET));
    expect(identityHash("email", "ab@gmail.com", SECRET)).not.toBe(identityHash("email", "ab@gmail.com", "t".repeat(32)));
    expect(identityHash("google", "1234", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the hash construction does not change (independent vector): if it changed, the stored bans would stop working", () => {
    const key = createHmac("sha256", SECRET).update("banned-identity").digest();
    const expected = (message: string) => createHmac("sha256", key).update(message).digest("hex");
    expect(identityHash("email", "  Ana.Lopez+x@Example.com ", SECRET)).toBe(expected("ana.lopez@example.com"));
    expect(identityHash("google", "1234", SECRET)).toBe(expected("google:1234"));
    // Fixed value computed once: also guards against a simultaneous change in code and test.
    expect(identityHash("google", "1234", SECRET)).toBe(FIXED_GOOGLE_1234);
  });
});
