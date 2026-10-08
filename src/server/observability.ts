import "server-only";
import * as Sentry from "@sentry/nextjs";
import { waitUntil } from "@vercel/functions";
import type { Instrumentation } from "next";

/** Tiempo máximo para enviar los errores pendientes antes de que la función de Vercel se congele. */
const FLUSH_MS = 2_000;

/**
 * Opciones de Sentry, solo en el servidor (spec 5a §6.1), o `null` sin `SENTRY_DSN`: entonces no se inicia
 * (en local y en los tests no se envía nada).
 */
export function sentryOptions(env: { SENTRY_DSN?: string; VERCEL_ENV?: string }): Sentry.NodeOptions | null {
  if (!env.SENTRY_DSN) return null;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.VERCEL_ENV ?? "development",
    // Sin trazas de rendimiento: solo errores, dentro de la cuota gratuita.
    tracesSampleRate: 0,
    // Ni IP ni cookies.
    sendDefaultPii: false,
    // Los errores que el código registra con console.error y no propaga (p. ej. "ranking failed" con Redis caído).
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ["error"] }),
      // Sin cuerpos de petición: nunca se guardan en memoria (llevan correos, nombres, etc.).
      Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
    ],
    beforeSend(event) {
      // De la petición solo el método: ni URL, query string (códigos y tokens del enlace mágico), cuerpo,
      // cabeceras ni cookies. Sentry los guarda aunque `sendDefaultPii` sea `false`.
      event.request = event.request ? { method: event.request.method } : undefined;
      // `captureRequestError` pone la ruta con su query string.
      const nextjs = event.contexts?.nextjs;
      if (typeof nextjs?.request_path === "string") nextjs.request_path = nextjs.request_path.split("?")[0];
      // En Vercel la función puede congelarse en cuanto responde: cada evento se envía antes de que acabe.
      waitUntil(Sentry.flush(FLUSH_MS));
      return event;
    },
  };
}

/** Se llama una vez al arrancar el servidor (`register` de `instrumentation.ts`). */
export function initSentry(): void {
  const options = sentryOptions({ SENTRY_DSN: process.env.SENTRY_DSN, VERCEL_ENV: process.env.VERCEL_ENV });
  if (options) Sentry.init(options);
}

/** Errores no controlados de rutas, páginas, acciones y la tarea diaria (`onRequestError`). */
export async function reportRequestError(...args: Parameters<Instrumentation.onRequestError>): Promise<void> {
  if (!Sentry.isInitialized()) return;
  Sentry.captureRequestError(...args);
  // Next espera a `onRequestError`: el error sale antes de que la función se congele.
  await Sentry.flush(FLUSH_MS);
}
