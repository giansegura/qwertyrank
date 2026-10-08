import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

/** Lo mínimo salvo `BETTER_AUTH_URL`, que en una vista previa puede faltar. */
const COMMON = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  UPSTASH_REDIS_REST_URL: "http://localhost:8079",
  UPSTASH_REDIS_REST_TOKEN: "token",
  ANON_COOKIE_SECRET: "a".repeat(32),
  IP_HASH_SECRET: "b".repeat(32),
  BETTER_AUTH_SECRET: "c".repeat(32),
};
const BASE = { ...COMMON, BETTER_AUTH_URL: "http://localhost:3000" };
const CRON = "d".repeat(32);
const PRODUCTION = {
  ...BASE,
  VERCEL_ENV: "production",
  RESEND_API_KEY: "re_x",
  TURNSTILE_SECRET_KEY: "1x0",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0",
};
/** Una vista previa de Vercel: sin `BETTER_AUTH_URL` ni `REDIS_KEY_PREFIX`, con las variables de sistema. */
const PREVIEW = {
  ...COMMON,
  VERCEL_ENV: "preview",
  VERCEL_URL: "qwertyrank-abc123-gian.vercel.app",
  VERCEL_BRANCH_URL: "qwertyrank-git-fase-5a-gian.vercel.app",
  VERCEL_GIT_PULL_REQUEST_ID: "9",
};

describe("parseServerEnv", () => {
  it("las variables opcionales vacías cuentan como ausentes", () => {
    const env = parseServerEnv({ ...BASE, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", RESEND_API_KEY: "" });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBe("QwertyRank <noreply@qwertyrank.com>");
  });

  it("exige un secreto de Better Auth de al menos 32 caracteres", () => {
    expect(() => parseServerEnv({ ...BASE, BETTER_AUTH_SECRET: "corto" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("en producción de Vercel exige la clave de Resend", () => {
    const turnstile = { TURNSTILE_SECRET_KEY: "1x0", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0" };
    expect(() => parseServerEnv({ ...BASE, ...turnstile, VERCEL_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(
      parseServerEnv({ ...BASE, ...turnstile, VERCEL_ENV: "production", RESEND_API_KEY: "re_x", CRON_SECRET: CRON }).RESEND_API_KEY,
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

  it("en producción de Vercel exige CRON_SECRET de al menos 32 caracteres", () => {
    expect(() => parseServerEnv(PRODUCTION)).toThrow(/CRON_SECRET/);
    expect(() => parseServerEnv({ ...PRODUCTION, CRON_SECRET: "corto" })).toThrow(/CRON_SECRET/);
    expect(parseServerEnv({ ...PRODUCTION, CRON_SECRET: CRON }).CRON_SECRET).toBe(CRON);
    expect(parseServerEnv(BASE).CRON_SECRET).toBeUndefined();
  });

  it("SENTRY_DSN es opcional, pero si está tiene que ser una URL", () => {
    expect(parseServerEnv({ ...BASE, SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
    expect(() => parseServerEnv({ ...BASE, SENTRY_DSN: "no-es-una-url" })).toThrow(/SENTRY_DSN/);
    expect(parseServerEnv({ ...BASE, SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" }).SENTRY_DSN).toBe(
      "https://k@o1.ingest.sentry.io/2",
    );
  });

  it("fuera de una vista previa, BETTER_AUTH_URL es obligatoria y el prefijo de Redis es qr:", () => {
    expect(() => parseServerEnv(COMMON)).toThrow(/BETTER_AUTH_URL/);
    expect(parseServerEnv(BASE)).toMatchObject({ REDIS_KEY_PREFIX: "qr:", AUTH_TRUSTED_ORIGINS: [] });
    expect(parseServerEnv({ ...BASE, REDIS_KEY_PREFIX: "qrtest:" }).REDIS_KEY_PREFIX).toBe("qrtest:");
  });

  it("en una vista previa, la URL de Better Auth sale de su rama y el prefijo de Redis, de su PR", () => {
    expect(parseServerEnv(PREVIEW)).toMatchObject({
      BETTER_AUTH_URL: "https://qwertyrank-git-fase-5a-gian.vercel.app",
      REDIS_KEY_PREFIX: "pr-9:",
      AUTH_TRUSTED_ORIGINS: ["https://qwertyrank-abc123-gian.vercel.app"],
    });
  });

  it("en una vista previa sin PR el prefijo es preview:, y lo que se defina a mano manda", () => {
    expect(parseServerEnv({ ...PREVIEW, VERCEL_GIT_PULL_REQUEST_ID: "" }).REDIS_KEY_PREFIX).toBe("preview:");
    expect(
      parseServerEnv({ ...PREVIEW, BETTER_AUTH_URL: "https://beta.example.com", REDIS_KEY_PREFIX: "x:" }),
    ).toMatchObject({ BETTER_AUTH_URL: "https://beta.example.com", REDIS_KEY_PREFIX: "x:" });
  });

  it("una vista previa no puede usar el prefijo de producción qr:", () => {
    expect(() => parseServerEnv({ ...PREVIEW, REDIS_KEY_PREFIX: "qr:" })).toThrow(/REDIS_KEY_PREFIX/);
    expect(parseServerEnv({ ...PREVIEW, REDIS_KEY_PREFIX: "pr-7:" }).REDIS_KEY_PREFIX).toBe("pr-7:");
    expect(parseServerEnv({ ...PRODUCTION, CRON_SECRET: CRON, REDIS_KEY_PREFIX: "qr:" }).REDIS_KEY_PREFIX).toBe("qr:");
  });
});
