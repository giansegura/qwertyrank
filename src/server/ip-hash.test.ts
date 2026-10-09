import { describe, expect, it } from "vitest";
import { clientIp, hashIp } from "./ip-hash";

const SECRET = "s".repeat(32);

describe("hashIp", () => {
  it("does not store the IP in plain text and is stable during the same UTC day", () => {
    const a = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T01:00:00Z"));
    const b = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T23:00:00Z"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.7");
    expect(b).toBe(a);
  });

  it("changes from one day to the next (rotating salt)", () => {
    const a = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T12:00:00Z"));
    const b = hashIp("203.0.113.7", SECRET, new Date("2026-10-06T12:00:00Z"));
    expect(b).not.toBe(a);
  });

  it("without an IP returns null", () => {
    expect(hashIp(null, SECRET, new Date())).toBeNull();
  });
});

describe("clientIp", () => {
  it("takes the first IP from x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("uses x-real-ip if there is no x-forwarded-for, and null if there is neither", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
  });
});
