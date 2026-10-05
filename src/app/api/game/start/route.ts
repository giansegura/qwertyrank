import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, createAnonId } from "@/server/anon";
import { serverEnv } from "@/server/env";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService } from "@/server/game/instance";
import { startBodySchema } from "@/server/game/schemas";

export async function POST(request: NextRequest) {
  const body = await parseBody(request, startBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  const existing = readOwner(request);
  const anon = existing ? null : createAnonId(serverEnv().ANON_COOKIE_SECRET);

  try {
    const game = await gameService().start({ owner: existing ?? anon!.id, ...body });
    const response = NextResponse.json(game);
    if (anon) {
      response.cookies.set(ANON_COOKIE, anon.value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ANON_COOKIE_MAX_AGE,
      });
    }
    return response;
  } catch (error) {
    console.error("start failed", error);
    return jsonError("unavailable", 503);
  }
}
