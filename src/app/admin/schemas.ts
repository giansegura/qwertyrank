import { z } from "zod";

export const playerId = z.uuid();
export const reason = z.string().trim().min(1).max(500);
export const statusInput = z.object({ playerId, reason, status: z.enum(["active", "shadowbanned", "banned"]) });
export const nickInput = z.object({ playerId, reason });
export const dismissInput = z.object({ playerId });
