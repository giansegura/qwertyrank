import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { jsonError } from "@/server/http";
import { isCronAuthorized } from "@/server/retention/cron-auth";
import { runDailyRetention } from "@/server/retention/daily";

/** El trabajo de un día no debe cortarse: en Vercel Hobby el tope por defecto puede ser menor (spec 5a §3.1). */
export const maxDuration = 60;

/** Tarea diaria (spec 5a §3): la llama Vercel Cron a las 04:00 UTC con `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return jsonError("unauthorized", 401);
  }
  const report = await runDailyRetention(getDb());
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
