import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { jsonError, readOwner } from "@/server/game/http";
import { claimGame } from "@/server/game/instance";

/** Pasa a la cuenta una partida anónima de este navegador jugada hace menos de 10 minutos (spec §3.7). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anonId = readOwner(request);
  if (!anonId || !z.uuid().safeParse(id).success) return jsonError("not_found", 404);

  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const outcome = await claimGame()({ gameId: id, anonId, userId: user.id });
    if (outcome.kind === "ok") return NextResponse.json(outcome.claim);
    return jsonError(outcome.kind, outcome.kind === "expired" ? 410 : 404);
  } catch (error) {
    console.error("claim failed", error);
    return jsonError("unavailable", 503);
  }
}
