import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getOwnResult } from "@/server/game/result";
import { jsonError } from "@/server/http";

/** La partida propia (spec 5d §5): la pide la 404 de `/r/[id]` cuando hay sesión. */
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
