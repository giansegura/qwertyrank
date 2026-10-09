// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeTargets, parseScriptEnv } from "./script-env";

const FULL = {
  DATABASE_URL: "postgres://user:s3cret@db.example.com:5432/app",
  UPSTASH_REDIS_REST_URL: "https://eu1-x.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "tok",
};

describe("scripts environment", () => {
  it("accepts the full environment and uses the app's default prefix", () => {
    expect(parseScriptEnv(FULL, "f")).toMatchObject({ redisKeyPrefix: "qr:", redisToken: "tok" });
    expect(parseScriptEnv({ ...FULL, REDIS_KEY_PREFIX: "x:" }, "f").redisKeyPrefix).toBe("x:");
  });

  it.each(["DATABASE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])("fails if %s is missing, naming it", (name) => {
    expect(() => parseScriptEnv({ ...FULL, [name]: undefined }, "the file")).toThrow(new RegExp(`${name}.*the file`));
    expect(() => parseScriptEnv({ ...FULL, [name]: "  " }, "f")).toThrow(name);
  });

  it("in a preview deployment requires its own prefix", () => {
    const preview = { ...FULL, VERCEL_ENV: "preview" };
    expect(() => parseScriptEnv(preview, "the file")).toThrow(/REDIS_KEY_PREFIX.*the file/);
    expect(() => parseScriptEnv({ ...preview, REDIS_KEY_PREFIX: "qr:" }, "f")).toThrow(/REDIS_KEY_PREFIX.*production/);
    expect(parseScriptEnv({ ...preview, REDIS_KEY_PREFIX: "pr-12:" }, "f").redisKeyPrefix).toBe("pr-12:");
  });

  it("shows only the hosts, without credentials", () => {
    const text = describeTargets(parseScriptEnv(FULL, "f"));
    expect(text).toContain("db.example.com:5432");
    expect(text).toContain("eu1-x.upstash.io");
    expect(text).not.toMatch(/s3cret|user|tok\b/);
  });
});
