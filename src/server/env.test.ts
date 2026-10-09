import { describe, expect, it } from "vitest";
import { DEV_ANTICHEAT_CONFIG } from "./anticheat/config";
import { parseServerEnv } from "./env";

/** The minimum except `BETTER_AUTH_URL`, which may be missing in a preview deployment. */
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
/** Production anti-cheat thresholds: different from the development ones. */
const ANTICHEAT = { ...DEV_ANTICHEAT_CONFIG, burstMedianMs: 31, wpmCeiling: { physical: 301, touch: 211 } };
const PRODUCTION = {
  ...BASE,
  VERCEL_ENV: "production",
  ANTICHEAT_CONFIG: JSON.stringify(ANTICHEAT),
  RESEND_API_KEY: "re_x",
  TURNSTILE_SECRET_KEY: "1x0",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0",
};
/** A Vercel preview deployment: no `BETTER_AUTH_URL` or `REDIS_KEY_PREFIX`, with the system variables. */
const PREVIEW = {
  ...COMMON,
  VERCEL_ENV: "preview",
  VERCEL_URL: "qwertyrank-abc123-gian.vercel.app",
  VERCEL_BRANCH_URL: "qwertyrank-git-fase-5a-gian.vercel.app",
  VERCEL_GIT_PULL_REQUEST_ID: "9",
};

describe("parseServerEnv", () => {
  it("empty optional variables count as missing", () => {
    const env = parseServerEnv({ ...BASE, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", RESEND_API_KEY: "" });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBe("QwertyRank <noreply@qwertyrank.com>");
  });

  it("requires a Better Auth secret of at least 32 characters", () => {
    expect(() => parseServerEnv({ ...BASE, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("in Vercel production requires the Resend key", () => {
    const turnstile = { TURNSTILE_SECRET_KEY: "1x0", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0" };
    expect(() => parseServerEnv({ ...BASE, ...turnstile, VERCEL_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(
      parseServerEnv({ ...BASE, ...turnstile, VERCEL_ENV: "production", RESEND_API_KEY: "re_x", CRON_SECRET: CRON, ANTICHEAT_CONFIG: PRODUCTION.ANTICHEAT_CONFIG }).RESEND_API_KEY,
    ).toBe("re_x");
  });

  it("the two Turnstile keys go together", () => {
    expect(() => parseServerEnv({ ...BASE, TURNSTILE_SECRET_KEY: "1x0" })).toThrow(/TURNSTILE/);
    expect(() => parseServerEnv({ ...BASE, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x0" })).toThrow(/TURNSTILE/);
    expect(parseServerEnv(BASE).TURNSTILE_SECRET_KEY).toBeUndefined();
  });

  it("in Vercel production requires the Turnstile keys", () => {
    expect(() => parseServerEnv({ ...BASE, VERCEL_ENV: "production", RESEND_API_KEY: "re_x" })).toThrow(/Turnstile/);
  });

  it("in Vercel production requires a CRON_SECRET of at least 32 characters", () => {
    expect(() => parseServerEnv(PRODUCTION)).toThrow(/CRON_SECRET/);
    expect(() => parseServerEnv({ ...PRODUCTION, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
    expect(parseServerEnv({ ...PRODUCTION, CRON_SECRET: CRON }).CRON_SECRET).toBe(CRON);
    expect(parseServerEnv(BASE).CRON_SECRET).toBeUndefined();
  });

  it("SENTRY_DSN is optional, but if present it must be a URL", () => {
    expect(parseServerEnv({ ...BASE, SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
    expect(() => parseServerEnv({ ...BASE, SENTRY_DSN: "not-a-url" })).toThrow(/SENTRY_DSN/);
    expect(parseServerEnv({ ...BASE, SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" }).SENTRY_DSN).toBe(
      "https://k@o1.ingest.sentry.io/2",
    );
  });

  it("outside a preview deployment, BETTER_AUTH_URL is required and the Redis prefix is qr:", () => {
    expect(() => parseServerEnv(COMMON)).toThrow(/BETTER_AUTH_URL/);
    expect(parseServerEnv(BASE)).toMatchObject({ REDIS_KEY_PREFIX: "qr:", AUTH_TRUSTED_ORIGINS: [] });
    expect(parseServerEnv({ ...BASE, REDIS_KEY_PREFIX: "qrtest:" }).REDIS_KEY_PREFIX).toBe("qrtest:");
  });

  it("in a preview deployment, the Better Auth URL comes from its branch and the Redis prefix from its PR", () => {
    expect(parseServerEnv(PREVIEW)).toMatchObject({
      BETTER_AUTH_URL: "https://qwertyrank-git-fase-5a-gian.vercel.app",
      REDIS_KEY_PREFIX: "pr-9:",
      AUTH_TRUSTED_ORIGINS: ["https://qwertyrank-abc123-gian.vercel.app"],
    });
  });

  it("in a preview deployment without a PR the prefix is preview:, and whatever is set by hand wins", () => {
    expect(parseServerEnv({ ...PREVIEW, VERCEL_GIT_PULL_REQUEST_ID: "" }).REDIS_KEY_PREFIX).toBe("preview:");
    expect(
      parseServerEnv({ ...PREVIEW, BETTER_AUTH_URL: "https://beta.example.com", REDIS_KEY_PREFIX: "x:" }),
    ).toMatchObject({ BETTER_AUTH_URL: "https://beta.example.com", REDIS_KEY_PREFIX: "x:" });
  });

  it("a preview deployment cannot use the production prefix qr:", () => {
    expect(() => parseServerEnv({ ...PREVIEW, REDIS_KEY_PREFIX: "qr:" })).toThrow(/REDIS_KEY_PREFIX/);
    expect(parseServerEnv({ ...PREVIEW, REDIS_KEY_PREFIX: "pr-7:" }).REDIS_KEY_PREFIX).toBe("pr-7:");
    expect(parseServerEnv({ ...PRODUCTION, CRON_SECRET: CRON, REDIS_KEY_PREFIX: "qr:" }).REDIS_KEY_PREFIX).toBe("qr:");
  });

  it("without ANTICHEAT_CONFIG, outside production, uses the development thresholds", () => {
    expect(parseServerEnv(BASE).ANTICHEAT).toEqual(DEV_ANTICHEAT_CONFIG);
    expect(parseServerEnv({ ...BASE, ANTICHEAT_CONFIG: "" }).ANTICHEAT).toEqual(DEV_ANTICHEAT_CONFIG);
  });

  it("ANTICHEAT_CONFIG is a JSON with every threshold", () => {
    expect(parseServerEnv({ ...BASE, ANTICHEAT_CONFIG: JSON.stringify(ANTICHEAT) }).ANTICHEAT).toEqual(ANTICHEAT);
    const { burstWindow: _, ...missing } = ANTICHEAT;
    expect(() => parseServerEnv({ ...BASE, ANTICHEAT_CONFIG: JSON.stringify(missing) })).toThrow(/ANTICHEAT_CONFIG/);
    expect(() => parseServerEnv({ ...BASE, ANTICHEAT_CONFIG: JSON.stringify({ ...ANTICHEAT, extra: 1 }) })).toThrow(/ANTICHEAT_CONFIG/);
    expect(() => parseServerEnv({ ...BASE, ANTICHEAT_CONFIG: JSON.stringify({ ...ANTICHEAT, unidentifiedRatio: 2 }) })).toThrow(
      /ANTICHEAT_CONFIG/,
    );
  });

  it("a broken ANTICHEAT_CONFIG fails without showing its content", () => {
    const secret = '{"burstMedianMs": 31, secret';
    let message = "";
    try {
      parseServerEnv({ ...BASE, ANTICHEAT_CONFIG: secret });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/ANTICHEAT_CONFIG/);
    expect(message).not.toContain("secret");
  });

  it("in Vercel production requires ANTICHEAT_CONFIG: the development thresholds are public", () => {
    const { ANTICHEAT_CONFIG: _, ...withoutConfig } = PRODUCTION;
    expect(() => parseServerEnv({ ...withoutConfig, CRON_SECRET: CRON })).toThrow(/ANTICHEAT_CONFIG/);
    expect(parseServerEnv({ ...PRODUCTION, CRON_SECRET: CRON }).ANTICHEAT).toEqual(ANTICHEAT);
  });

  it("in production does not accept the development thresholds, which are in the code", () => {
    expect(() =>
      parseServerEnv({ ...PRODUCTION, CRON_SECRET: CRON, ANTICHEAT_CONFIG: JSON.stringify(DEV_ANTICHEAT_CONFIG) }),
    ).toThrow(/ANTICHEAT_CONFIG/);
  });
});
