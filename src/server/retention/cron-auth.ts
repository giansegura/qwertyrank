import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * ¿Viene de Vercel Cron? Vercel manda `Authorization: Bearer <CRON_SECRET>` (spec 5a §3.1). Sin secreto
 * configurado nunca: la tarea no se ejecuta por accidente. Comparación en tiempo constante.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
