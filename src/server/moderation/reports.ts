import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";
import type { Db } from "../db/client";
import { reports, users } from "../db/schema";
import type { RateLimit, RateLimiter } from "../rate-limit";

/** Spec 4a §4.2: at most 10 reports per reporter every 24 h. */
export const REPORT_LIMIT: RateLimit = { max: 10, windowMs: 24 * 60 * 60 * 1000 };

export const reportBodySchema = z.object({
  nick: z.string().trim().min(1).max(40),
  reason: z.enum(REPORT_REASONS),
});

export type ReportOutcome = { kind: "ok" | "not_found" | "self" } | { kind: "rate_limited"; retryAfter: number };

/**
 * Reports a player by their nick (spec 4a §4.2). Responds `ok` also if they are sanctioned or if the
 * report already existed: the response must not give away a shadow ban.
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
    // Only one open per reporter, reported player and reason (partial unique index): repeating it doesn't count.
    await db.insert(reports).values({ reporterId, targetUserId: target.id, reason }).onConflictDoNothing();
    return { kind: "ok" };
  };
}

export type CreateReport = ReturnType<typeof createReports>;
