import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "c".repeat(32);

/** La ruta con `CRON_SECRET` recién leída: `serverEnv()` guarda las variables la primera vez. */
async function cronRoute(secret: string | undefined) {
  vi.stubEnv("CRON_SECRET", secret);
  vi.resetModules();
  return import("./route");
}

const request = (authorization?: string) =>
  new NextRequest("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/daily", () => {
  it("sin CRON_SECRET configurada responde 401 aunque llegue una cabecera", async () => {
    const { GET } = await cronRoute(undefined);
    const response = await GET(request("Bearer undefined"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("con otro secreto o sin cabecera responde 401", async () => {
    const { GET } = await cronRoute(SECRET);
    expect((await GET(request(`Bearer ${"x".repeat(32)}`))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
  });

  it("con el secreto ejecuta la tarea y devuelve lo que ha hecho, sin caché", async () => {
    const { GET } = await cronRoute(SECRET);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      extracted: expect.any(Number),
      deletedLogs: expect.any(Number),
      anonymizedGames: expect.any(Number),
      done: true,
    });
  });
});
