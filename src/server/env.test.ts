import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const BASE = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  UPSTASH_REDIS_REST_URL: "http://localhost:8079",
  UPSTASH_REDIS_REST_TOKEN: "token",
  ANON_COOKIE_SECRET: "a".repeat(32),
  IP_HASH_SECRET: "b".repeat(32),
  BETTER_AUTH_SECRET: "c".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("las variables opcionales vacías cuentan como ausentes", () => {
    const env = parseServerEnv({ ...BASE, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", RESEND_API_KEY: "" });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBe("QwertyRank <noreply@qwertyrank.com>");
  });

  it("exige un secreto de Better Auth de al menos 32 caracteres", () => {
    expect(() => parseServerEnv({ ...BASE, BETTER_AUTH_SECRET: "corto" })).toThrow();
  });

  it("en producción de Vercel exige la clave de Resend", () => {
    const turnstile = { TURNSTILE_SECRET_KEY: "1x0", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0" };
    expect(() => parseServerEnv({ ...BASE, ...turnstile, VERCEL_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(
      parseServerEnv({ ...BASE, ...turnstile, VERCEL_ENV: "production", RESEND_API_KEY: "re_x" }).RESEND_API_KEY,
    ).toBe("re_x");
  });

  it("las dos claves de Turnstile van juntas", () => {
    expect(() => parseServerEnv({ ...BASE, TURNSTILE_SECRET_KEY: "1x0" })).toThrow(/TURNSTILE/);
    expect(() => parseServerEnv({ ...BASE, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0" })).toThrow(/TURNSTILE/);
    expect(parseServerEnv(BASE).TURNSTILE_SECRET_KEY).toBeUndefined();
  });

  it("en producción de Vercel exige las claves de Turnstile", () => {
    expect(() => parseServerEnv({ ...BASE, VERCEL_ENV: "production", RESEND_API_KEY: "re_x" })).toThrow(/Turnstile/);
  });
});
