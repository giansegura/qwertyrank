import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { checkNick } from "./nick";

export const profileBodySchema = z.object({
  nick: z.string().trim().max(40),
  country: z.string().max(2).nullable(),
});

export type ProfileInput = z.infer<typeof profileBodySchema>;
export type ProfileError = "invalid_nick" | "profane_nick" | "nick_taken" | "invalid_country";

/** El índice único sobre `lower(nick)` salta: otro usuario ya lo tiene, con cualquier mayúscula. */
function isNickTakenError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } } | null)?.cause;
  return cause?.code === "23505" && cause.constraint_name === "users_nick_lower_idx";
}

export function createUpdateProfile(db: Db) {
  return async (userId: string, input: ProfileInput): Promise<{ ok: true } | { ok: false; error: ProfileError }> => {
    const problem = checkNick(input.nick);
    if (problem) return { ok: false, error: problem === "invalid" ? "invalid_nick" : "profane_nick" };
    if (input.country !== null && !isCountryCode(input.country)) return { ok: false, error: "invalid_country" };
    try {
      await db.update(users).set({ nick: input.nick, country: input.country }).where(eq(users.id, userId));
      return { ok: true };
    } catch (error) {
      if (isNickTakenError(error)) return { ok: false, error: "nick_taken" };
      throw error;
    }
  };
}
