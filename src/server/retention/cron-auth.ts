import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Does it come from Vercel Cron? Vercel sends `Authorization: Bearer <CRON_SECRET>` (spec 5a §3.1). Without a
 * configured secret, never: the task does not run by accident. Constant-time comparison.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
