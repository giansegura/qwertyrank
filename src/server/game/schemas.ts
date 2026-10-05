import "server-only";
import { z } from "zod";
import { TEST_LANGUAGES } from "@/lib/words/languages";

/** Validación de todo lo que llega a la API de partidas (spec §8.3). */

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

export const startBodySchema = z.object({
  language: z.enum(TEST_LANGUAGES),
  env: z.object({
    coarse: z.boolean(),
    touchPoints: z.number().int().min(0).max(32),
  }),
});

// Una partida honesta de 30 s son ~11 tandas de pocos cientos de eventos: los límites cortan abusos.
export const keysBodySchema = z.object({
  seq: z.number().int().min(1).max(30),
  events: z.array(typingEventSchema).max(1_000),
});

export const finishBodySchema = z.object({
  lastSeq: z.number().int().min(0).max(30),
});
