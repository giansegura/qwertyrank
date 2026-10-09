// @vitest-environment node
import { randomInt, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/nextjs";
import { DrizzleQueryError } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initSentry, reportRequestError, sentryOptions } from "./observability";

/** A session and an IP that do not appear in the code: Sentry attaches the code lines of each error. */
const SESSION = randomUUID();
const IP = `203.0.113.${randomInt(1, 255)}`;
const REQUEST = {
  path: "/api/cron/daily",
  method: "GET",
  headers: { cookie: `qr.session_token=${SESSION}`, "x-forwarded-for": IP },
};

describe("sentryOptions", () => {
  it("without SENTRY_DSN, Sentry does not start", () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: "", VERCEL_ENV: "production" })).toBeNull();
  });

  it("with a DSN: errors only, no personal data, and console.error too", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/2", VERCEL_ENV: "preview" });
    expect(options).toMatchObject({
      dsn: "https://k@o1.ingest.sentry.io/2",
      environment: "preview",
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    // No console breadcrumbs, but the others are kept.
    expect(options?.beforeBreadcrumb?.({ category: "console", message: "x" }, undefined)).toBeNull();
    const http = { category: "http", message: "x" };
    expect(options?.beforeBreadcrumb?.(http, undefined)).toBe(http);
    expect(options?.integrations).toEqual([
      expect.objectContaining({ name: "CaptureConsole" }),
      expect.objectContaining({ name: "Http" }),
    ]);
    expect(sentryOptions({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" })?.environment).toBe("development");
  });
});

/** A fake Sentry: stores the events of every envelope it receives. */
describe("Sentry against a local server", () => {
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
    // Before starting Sentry: that way it wraps it and the test output stays clean.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    initSentry();
  });

  afterAll(async () => {
    await Sentry.close(2_000);
    consoleError.mockRestore();
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
  });

  it("an error the code logs with console.error arrives, without user data", async () => {
    console.error("ranking failed", new Error("redis down"));
    await Sentry.flush(2_000);
    const event = events.find((sent) => JSON.stringify(sent).includes("redis down"));
    expect(event).toMatchObject({ environment: "preview", level: "error" });
    expect(event?.user).toBeUndefined();
  });

  it("an unhandled request error arrives with its path, and onRequestError waits for the send", async () => {
    await reportRequestError(
      new Error("boom in the job"),
      REQUEST,
      {
        routerKind: "App Router",
        routePath: "/api/cron/daily",
        routeType: "route",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      },
    );
    const event = events.find((sent) => JSON.stringify(sent).includes("boom in the job"));
    expect(event).toMatchObject({
      contexts: { nextjs: { request_path: "/api/cron/daily", route_type: "route" } },
      request: { method: "GET" },
    });
    // No headers or cookies: neither the session nor the IP goes out to Sentry.
    expect(event?.request).toEqual({ method: "GET" });
    expect(JSON.stringify(event)).not.toContain(SESSION);
    expect(JSON.stringify(event)).not.toContain(IP);
  });

  it("the parameters of a failed query do not reach Sentry, neither through console.error nor through onRequestError", async () => {
    const EMAIL = `${randomUUID()}@example.com`;
    const failure = () =>
      new DrizzleQueryError('update "user" set "name" = $1 where "email" = $2', [`n-${EMAIL}`, EMAIL], new Error("connection refused"));
    console.error("profile update failed", failure());
    await reportRequestError(failure(), REQUEST, {
      routerKind: "App Router",
      routePath: "/api/cron/daily",
      routeType: "route",
      renderSource: "react-server-components",
      revalidateReason: undefined,
    });
    await Sentry.flush(2_000);
    const mine = events.filter((sent) => JSON.stringify(sent).includes("Failed query"));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const event of mine) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(EMAIL);
      expect(serialized).toContain("Failed query");
      expect(serialized).toContain("params: [redacted]");
    }
  });

  it("neither the body nor the query string of a real request reaches Sentry", async () => {
    const BODY_SECRET = randomUUID();
    const QUERY_SECRET = randomUUID();
    const app = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", async () => {
        expect(body).toContain(BODY_SECRET);
        console.error("handler failed", new Error("failure with real request"));
        await reportRequestError(
          new Error("boom with real request"),
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
    const mine = events.filter((sent) => JSON.stringify(sent).includes("real request"));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const event of mine) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(BODY_SECRET);
      expect(serialized).not.toContain(QUERY_SECRET);
      expect(event.request).toEqual({ method: "POST" });
    }
    // Sentry attaches the code lines of each error: tell them apart by the exception value.
    const reported = mine.find((event) => (event.exception as { values: { value: string }[] }).values[0].value === "boom with real request");
    expect(reported).toMatchObject({
      contexts: { nextjs: { request_path: "/es/entrar", route_type: "route" } },
    });
  });
});
