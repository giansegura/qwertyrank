import "server-only";
import { createHmac } from "node:crypto";

/** The IP is never stored in plain text: HMAC with a salt that changes every UTC day (spec §6). */

export function hashIp(ip: string | null, secret: string, now: Date): string | null {
  if (!ip) return null;
  const day = now.toISOString().slice(0, 10);
  const dailySalt = createHmac("sha256", secret).update(day).digest();
  return createHmac("sha256", dailySalt).update(ip).digest("hex");
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}
