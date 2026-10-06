import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";
import type { Db } from "../db/client";
import { reports, users } from "../db/schema";
import type { RateLimit, RateLimiter } from "../rate-limit";

/** Spec 4a §4.2: como mucho 10 denuncias por denunciante cada 24 h. */
export const REPORT_LIMIT: RateLimit = { max: 10, windowMs: 24 * 60 * 60 * 1000 };

export const reportBodySchema = z.object({
  nick: z.string().trim().min(1).max(40),
  reason: z.enum(REPORT_REASONS),
});

export type ReportOutcome = { kind: "ok" | "not_found" | "self" } | { kind: "rate_limited"; retryAfter: number };

/**
 * Denuncia a un jugador por su nick (spec 4a §4.2). Responde `ok` también si está sancionado o si la
 * denuncia ya existía: la respuesta no debe delatar un shadow-ban.
 */
export function createReports(db: Db, limit: RateLimiter, rule: RateLimit = REPORT_LIMIT) {
  return async (reporterId: string, nick: string, reason: ReportReason): Promise<ReportOutcome> => {
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.nick}) = lower(${nick})`);
    if (!target) return { kind: "not_found" };
    if (target.id === reporterId) return { kind: "self" };
    const allowed = await limit("reports", reporterId, rule);
    if (!allowed.ok) return { kind: "rate_limited", retryAfter: allowed.retryAfterSeconds };
    // Una sola abierta por denunciante, denunciado y motivo (índice único parcial): repetirla no cuenta.
    await db.insert(reports).values({ reporterId, targetUserId: target.id, reason }).onConflictDoNothing();
    return { kind: "ok" };
  };
}

export type CreateReport = ReturnType<typeof createReports>;
