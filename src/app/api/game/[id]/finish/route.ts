import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService } from "@/server/game/instance";
import { finishBodySchema } from "@/server/game/schemas";
import { clientIp, hashIp } from "@/server/ip-hash";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = readOwner(request);
  if (!owner) return jsonError("not_found", 404);
  const body = await parseBody(request, finishBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  try {
    const ipHash = hashIp(clientIp(request.headers), serverEnv().IP_HASH_SECRET, new Date());
    const outcome = await gameService().finish({ owner, gameId: id, lastSeq: body.lastSeq, ipHash });
    if (outcome.kind === "ok") return NextResponse.json(outcome.response);
    return jsonError(outcome.kind, outcome.kind === "not_found" ? 404 : 409);
  } catch (error) {
    console.error("finish failed", error);
    return jsonError("unavailable", 503);
  }
}
