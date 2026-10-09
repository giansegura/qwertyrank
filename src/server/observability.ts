import "server-only";
import * as Sentry from "@sentry/nextjs";
import { waitUntil } from "@vercel/functions";
import type { Instrumentation } from "next";

/** Maximum time to send the pending errors before the Vercel function freezes. */
const FLUSH_MS = 2_000;

/** Strips the parameter values from a Drizzle query error and keeps the query text. */
function scrubParams(text: string): string {
  return text.replace(/\nparams: [\s\S]*$/, "\nparams: [redacted]");
}

/**
 * Sentry options, server only (spec 5a §6.1), or `null` without `SENTRY_DSN`: then it does not start
 * (nothing is sent locally or in the tests).
 */
export function sentryOptions(env: { SENTRY_DSN?: string; VERCEL_ENV?: string }): Sentry.NodeOptions | null {
  if (!env.SENTRY_DSN) return null;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV ?? "development",
    // No performance traces: errors only, within the free quota.
    tracesSampleRate: 0,
    // No IP and no cookies.
    sendDefaultPii: false,
    // The errors the code logs with console.error and does not propagate (e.g. "ranking failed" with Redis down).
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ["error"] }),
      // No request bodies: they are never kept in memory (they carry emails, names, etc.).
      Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
    ],
    // console.error calls already arrive as events (with their arguments filtered in `beforeSend`): no console breadcrumbs.
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "console" ? null : breadcrumb),
    beforeSend(event) {
      // Only the method from the request: no URL, query string (magic link codes and tokens), body,
      // headers or cookies. Sentry stores them even when `sendDefaultPii` is `false`.
      event.request = event.request ? { method: event.request.method } : undefined;
      // `captureRequestError` sets the path with its query string.
      const nextjs = event.contexts?.nextjs;
      if (typeof nextjs?.request_path === "string") nextjs.request_path = nextjs.request_path.split("?")[0];
      // Drizzle puts the query parameters (emails, nicks, ids, hashes) in the message: "…\nparams: <values>".
      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = scrubParams(exception.value);
      }
      if (event.message) event.message = scrubParams(event.message);
      // CaptureConsole copies the console.error arguments here, query errors included.
      delete event.extra?.arguments;
      // On Vercel the function may freeze as soon as it responds: each event is sent before it ends.
      waitUntil(Sentry.flush(FLUSH_MS));
      return event;
    },
  };
}

/** Called once when the server starts (`register` in `instrumentation.ts`). */
export function initSentry(): void {
  const options = sentryOptions({ SENTRY_DSN: process.env.SENTRY_DSN, VERCEL_ENV: process.env.VERCEL_ENV });
  if (options) Sentry.init(options);
}

/** Unhandled errors from routes, pages, actions and the daily job (`onRequestError`). */
export async function reportRequestError(...args: Parameters<Instrumentation.onRequestError>): Promise<void> {
  if (!Sentry.isInitialized()) return;
  Sentry.captureRequestError(...args);
  // Next awaits `onRequestError`: the error goes out before the function freezes.
  await Sentry.flush(FLUSH_MS);
}
