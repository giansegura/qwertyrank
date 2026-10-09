import "server-only";
import { z } from "zod";
import { TEST_LANGUAGES } from "@/lib/words/languages";

/** Validation of everything that reaches the games API (spec §8.3). */

const keyEvent = z.object({
  t: z.number(),
  type: z.enum(["down", "up"]),
  key: z.string().max(32),
  code: z.string().max(32),
  trusted: z.boolean(),
});

const inputEvent = z.object({
  t: z.number(),
  type: z.literal("input"),
  deleted: z.number().int().min(0).max(64),
  inserted: z.string().max(64),
  trusted: z.boolean(),
});

export const typingEventSchema = z.discriminatedUnion("type", [keyEvent, inputEvent]);

const startBase = {
  language: z.enum(TEST_LANGUAGES),
  env: z.object({
    coarse: z.boolean(),
    touchPoints: z.number().int().min(0).max(32),
  }),
  // Turnstile challenge token (spec 4a §2), only when retrying `start` after `needs_challenge`.
  turnstileToken: z.string().min(1).max(2_048).optional(),
};

/** Ranked (no `mode`, as before 4b) or a record verification, which says which one (spec 4b §3.1). */
export const startBodySchema = z.union([
  z.object({ ...startBase, mode: z.literal("ranked").optional() }),
  z.object({ ...startBase, mode: z.literal("verification"), verificationId: z.uuid() }),
]);

// An honest 30 s game is ~11 batches of a few hundred events: the limits cut off abuse.
export const keysBodySchema = z.object({
  seq: z.number().int().min(1).max(30),
  events: z.array(typingEventSchema).max(1_000),
});

export const finishBodySchema = z.object({
  lastSeq: z.number().int().min(0).max(30),
});
