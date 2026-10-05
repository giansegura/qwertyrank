import { describe, expect, it } from "vitest";
import { clientIp, hashIp } from "./ip-hash";

const SECRET = "s".repeat(32);

describe("hashIp", () => {
  it("no guarda la IP en claro y es estable durante el mismo día UTC", () => {
    const a = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T01:00:00Z"));
    const b = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T23:00:00Z"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.7");
    expect(b).toBe(a);
  });

  it("cambia de un día a otro (sal rotativa)", () => {
    const a = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T12:00:00Z"));
    const b = hashIp("203.0.113.7", SECRET, new Date("2026-10-06T12:00:00Z"));
    expect(b).not.toBe(a);
  });

  it("sin IP devuelve null", () => {
    expect(hashIp(null, SECRET, new Date())).toBeNull();
  });
});

describe("clientIp", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("usa x-real-ip si no hay x-forwarded-for, y null si no hay ninguna", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
  });
});
