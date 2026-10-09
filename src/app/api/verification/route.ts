import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { jsonError } from "@/server/http";
import { pendingVerifications } from "@/server/verification/pending";

/** The player's records pending verification (spec 4b §4.3), without cache: the menu requests it on every page. */
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const pending = await pendingVerifications(getDb(), user.id);
    return NextResponse.json({ pending }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("pending verifications failed", error);
    return jsonError("unavailable", 503);
  }
}
