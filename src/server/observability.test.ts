// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initSentry, reportRequestError, sentryOptions } from "./observability";

/** Una sesión y una IP que no aparecen en el código: Sentry adjunta las líneas de código de cada error. */
const SESSION = randomUUID();
const IP = `203.0.113.${randomInt(1, 255)}`;
const REQUEST = {
  path: "/api/cron/daily",
  method: "GET",
  headers: { cookie: `qr.session_token=${SESSION}`, "x-forwarded-for": IP },
};

describe("sentryOptions", () => {
  it("sin SENTRY_DSN, Sentry no se inicia", () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: "", VERCEL_ENV: "production" })).toBeNull();
  });

  it("con DSN: solo errores, sin datos personales, y los console.error también", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/2", VERCEL_ENV: "preview" });
    expect(options).toMatchObject({
      dsn: "https://k@o1.ingest.sentry.io/2",
      environment: "preview",
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    expect(options?.integrations).toEqual([
      expect.objectContaining({ name: "CaptureConsole" }),
      expect.objectContaining({ name: "Http" }),
    ]);
    expect(sentryOptions({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" })?.environment).toBe("development");
  });
});

/** Un Sentry de mentira: guarda los eventos de cada envelope que recibe. */
describe("Sentry contra un servidor local", () => {
  const events: Record<string, unknown>[] = [];
  let server: Server;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        const [, itemHeader, payload] = body.split("\n");
        if (itemHeader && JSON.parse(itemHeader).type === "event") events.push(JSON.parse(payload));
        response.writeHead(200).end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    vi.stubEnv("SENTRY_DSN", `http://public@127.0.0.1:${port}/1`);
    vi.stubEnv("VERCEL_ENV", "preview");
    // Antes de iniciar Sentry: así lo envuelve y la salida de los tests queda limpia.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    initSentry();
  });

  afterAll(async () => {
    await Sentry.close(2_000);
    consoleError.mockRestore();
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
  });

  it("un error que el código registra con console.error llega, sin datos del usuario", async () => {
    console.error("ranking failed", new Error("redis down"));
    await Sentry.flush(2_000);
    const event = events.find((sent) => JSON.stringify(sent).includes("redis down"));
    expect(event).toMatchObject({ environment: "preview", level: "error" });
    expect(event?.user).toBeUndefined();
  });

  it("un error no controlado de una petición llega con su ruta, y onRequestError espera al envío", async () => {
    await reportRequestError(
      new Error("boom en la tarea"),
      REQUEST,
      {
        routerKind: "App Router",
        routePath: "/api/cron/daily",
        routeType: "route",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      },
    );
    const event = events.find((sent) => JSON.stringify(sent).includes("boom en la tarea"));
    expect(event).toMatchObject({
      contexts: { nextjs: { request_path: "/api/cron/daily", route_type: "route" } },
      request: { method: "GET" },
    });
    // Ni cabeceras ni cookies: ni la sesión ni la IP salen hacia Sentry.
    expect(event?.request).toEqual({ method: "GET" });
    expect(JSON.stringify(event)).not.toContain(SESSION);
    expect(JSON.stringify(event)).not.toContain(IP);
  });

  it("ni el cuerpo ni la query string de una petición real llegan a Sentry", async () => {
    const BODY_SECRET = randomUUID();
    const QUERY_SECRET = randomUUID();
    const app = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", async () => {
        expect(body).toContain(BODY_SECRET);
        console.error("handler failed", new Error("fallo con petición real"));
        await reportRequestError(
          new Error("boom con petición real"),
          { path: `/es/entrar?code=${QUERY_SECRET}`, method: "POST", headers: {} },
          {
            routerKind: "App Router",
            routePath: "/es/entrar",
            routeType: "route",
            renderSource: "react-server-components",
            revalidateReason: undefined,
          },
        );
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    const { port } = app.address() as AddressInfo;
    try {
      await fetch(`http://127.0.0.1:${port}/es/entrar?code=${QUERY_SECRET}&token=${QUERY_SECRET}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `email=${BODY_SECRET}%40example.com&username=${BODY_SECRET}`,
      });
      await Sentry.flush(2_000);
    } finally {
      await new Promise((resolve) => app.close(resolve));
    }
    const mine = events.filter((sent) => JSON.stringify(sent).includes("petición real"));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const event of mine) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(BODY_SECRET);
      expect(serialized).not.toContain(QUERY_SECRET);
      expect(event.request).toEqual({ method: "POST" });
    }
    // Sentry adjunta las líneas de código de cada error: se distingue por el valor de la excepción.
    const reported = mine.find((event) => (event.exception as { values: { value: string }[] }).values[0].value === "boom con petición real");
    expect(reported).toMatchObject({
      contexts: { nextjs: { request_path: "/es/entrar", route_type: "route" } },
    });
  });
});
