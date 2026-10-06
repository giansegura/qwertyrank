import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, createAnonId } from "@/server/anon";
import { getSessionUser } from "@/server/auth/session";
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
    // Solo `start` mira la sesión: `keys` y `finish` se autentican con la cookie anónima (spec §4.2).
    const user = await getSessionUser(request.headers);
    const game = await gameService().start({ owner: existing ?? anon!.id, userId: user?.id ?? null, ...body });
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
