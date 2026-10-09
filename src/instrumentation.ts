import type { Instrumentation } from "next";

/**
 * Sentry only on the server (spec 5a §6.1): it starts in the Node runtime, with no `withSentryConfig` and nothing
 * in the browser. The imports are dynamic so the Edge runtime does not load the SDK.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initSentry } = await import("./server/observability");
  initSentry();
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("./server/observability");
  await reportRequestError(...args);
};
