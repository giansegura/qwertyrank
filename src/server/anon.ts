import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** Identificador anónimo del jugador, en una cookie firmada con HMAC: `<id>.<firma>`. */

export const ANON_COOKIE = "qr_anon";
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

export function createAnonId(secret: string): { id: string; value: string } {
  const id = randomUUID();
  return { id, value: `${id}.${sign(id, secret)}` };
}

export function readAnonId(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(id, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}
