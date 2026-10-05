import { NextResponse, type NextRequest } from "next/server";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService } from "@/server/game/instance";
import { keysBodySchema } from "@/server/game/schemas";

const STATUS_CODE = { ok: 200, duplicate: 200, out_of_order: 409, too_large: 413, closed: 409, not_found: 404 } as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = readOwner(request);
  if (!owner) return jsonError("not_found", 404);
  const body = await parseBody(request, keysBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  try {
    const status = await gameService().appendKeys({ owner, gameId: id, ...body });
    return NextResponse.json({ status }, { status: STATUS_CODE[status] });
  } catch (error) {
    console.error("keys failed", error);
    return jsonError("unavailable", 503);
  }
}
