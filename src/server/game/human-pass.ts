import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Human pass (spec 4a §2): after passing Turnstile, the `qr_human` = `<exp>.<signature>` cookie is valid for an hour.
 * The signature covers the `anon_id`: a pass cannot be shared among many clients of a bot.
 */
export const HUMAN_COOKIE = "qr_human";
export const HUMAN_PASS_SECONDS = 60 * 60;

function sign(anonId: string, exp: number, secret: string): string {
  return createHmac("sha256", secret).update(`human:${anonId}:${exp}`).digest("base64url");
}

export function issueHumanPass(anonId: string, secret: string, now: Date): string {
  const exp = Math.floor(now.getTime() / 1000) + HUMAN_PASS_SECONDS;
  return `${exp}.${sign(anonId, exp, secret)}`;
}

export function isValidHumanPass(value: string | undefined, anonId: string, secret: string, now: Date): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now.getTime()) return false;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(anonId, exp, secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
