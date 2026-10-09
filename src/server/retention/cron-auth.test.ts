// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const SECRET = "s".repeat(32);

describe("isCronAuthorized", () => {
  it("only with Authorization: Bearer and the exact secret", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${"t".repeat(32)}`, SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(null, SECRET)).toBe(false);
  });

  it("without a configured secret, never", () => {
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
  });
});
