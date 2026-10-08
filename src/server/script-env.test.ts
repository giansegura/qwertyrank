// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeTargets, parseScriptEnv } from "./script-env";

const FULL = {
  DATABASE_URL: "postgres://user:s3cret@db.example.com:5432/app",
  UPSTASH_REDIS_REST_URL: "https://eu1-x.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "tok",
};

describe("entorno de los scripts", () => {
  it("acepta el entorno completo y usa el prefijo por defecto de la app", () => {
    expect(parseScriptEnv(FULL, "f")).toMatchObject({ redisKeyPrefix: "qr:", redisToken: "tok" });
    expect(parseScriptEnv({ ...FULL, REDIS_KEY_PREFIX: "x:" }, "f").redisKeyPrefix).toBe("x:");
  });

  it.each(["DATABASE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])("falla si falta %s, nombrándola", (name) => {
    expect(() => parseScriptEnv({ ...FULL, [name]: undefined }, "el archivo")).toThrow(new RegExp(`${name}.*el archivo`));
    expect(() => parseScriptEnv({ ...FULL, [name]: "  " }, "f")).toThrow(name);
  });

  it("en una vista previa exige un prefijo propio", () => {
    const preview = { ...FULL, VERCEL_ENV: "preview" };
    expect(() => parseScriptEnv(preview, "el archivo")).toThrow(/REDIS_KEY_PREFIX.*el archivo/);
    expect(() => parseScriptEnv({ ...preview, REDIS_KEY_PREFIX: "qr:" }, "f")).toThrow(/REDIS_KEY_PREFIX.*producción/);
    expect(parseScriptEnv({ ...preview, REDIS_KEY_PREFIX: "pr-12:" }, "f").redisKeyPrefix).toBe("pr-12:");
  });

  it("muestra solo los hosts, sin credenciales", () => {
    const text = describeTargets(parseScriptEnv(FULL, "f"));
    expect(text).toContain("db.example.com:5432");
    expect(text).toContain("eu1-x.upstash.io");
    expect(text).not.toMatch(/s3cret|user|tok\b/);
  });
});
