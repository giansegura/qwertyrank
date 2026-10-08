import type { Instrumentation } from "next";

/**
 * Sentry solo en el servidor (spec 5a §6.1): se inicia en el runtime de Node, sin `withSentryConfig` ni nada
 * en el navegador. Los imports son dinámicos para que el runtime Edge no cargue el SDK.
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
