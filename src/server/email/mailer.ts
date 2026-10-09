import "server-only";
import type { Redis } from "@upstash/redis";
import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

export const OUTBOX_TTL_SECONDS = 3_600;

/**
 * Without a Resend key (development, tests and E2E) the email is not sent: it is written to the
 * `pnpm dev` console and to a Redis list, where the E2E tests read it. The most recent goes first.
 */
export function createOutboxMailer(redis: Redis, prefix: string): SendEmail {
  return async (message) => {
    const key = `${prefix}outbox:${message.to.toLowerCase()}`;
    await redis.lpush(key, JSON.stringify(message));
    await redis.expire(key, OUTBOX_TTL_SECONDS);
    console.info(`[email] ${message.to}: ${message.subject}\n${message.text}`);
  };
}

/** Resend does not throw on API errors: it returns `{ error }`, which is turned into an exception here. */
export function createResendMailer(apiKey: string, from: string): SendEmail {
  const resend = new Resend(apiKey);
  return async (message) => {
    const { error } = await resend.emails.send({ from, ...message });
    if (error) throw new Error(`resend ${error.name}: ${error.message}`);
  };
}

export function createMailer(
  env: { RESEND_API_KEY?: string; EMAIL_FROM: string; REDIS_KEY_PREFIX: string },
  redis: Redis,
): SendEmail {
  return env.RESEND_API_KEY
    ? createResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
    : createOutboxMailer(redis, env.REDIS_KEY_PREFIX);
}
