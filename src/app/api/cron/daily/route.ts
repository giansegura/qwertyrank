import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { jsonError } from "@/server/http";
import { isCronAuthorized } from "@/server/retention/cron-auth";
import { runDailyRetention } from "@/server/retention/daily";

/** A day's work must not be cut off: on Vercel Hobby the default limit may be lower (spec 5a §3.1). */
export const maxDuration = 60;

/** Daily job (spec 5a §3): Vercel Cron calls it at 04:00 UTC with `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return jsonError("unauthorized", 401);
  }
  const report = await runDailyRetention(getDb());
  // Vercel does not keep the response body: the report goes to the logs, and if work remains, to Sentry.
  console.info("daily retention", report);
  if (!report.done) console.error("daily retention did not finish; work remains for tomorrow", report);
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
