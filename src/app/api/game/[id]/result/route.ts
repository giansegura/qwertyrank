import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getOwnResult } from "@/server/game/result";
import { jsonError } from "@/server/http";

/** The player's own game (spec 5d §5): requested by the 404 of `/r/[id]` when there is a session. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const { id } = await params;
    const result = await getOwnResult(getDb(), user.id, id);
    if (!result) return jsonError("not_found", 404);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("own result failed", error);
    return jsonError("unavailable", 503);
  }
}
