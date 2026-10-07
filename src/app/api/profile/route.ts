import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { revalidatePlayerPages } from "@/server/cache";
import { getDb } from "@/server/db/client";
import { jsonError, parseBody } from "@/server/http";
import { getOwnProfile } from "@/server/profile/public";
import { createUpdateProfile, profileBodySchema } from "@/server/profile/update";

export async function PATCH(request: NextRequest) {
  const body = await parseBody(request, profileBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const result = await createUpdateProfile(getDb(), revalidatePlayerPages)(user.id, body);
    if (result.ok) return NextResponse.json({ ok: true });
    return jsonError(result.error, result.error === "nick_taken" ? 409 : 400);
  } catch (error) {
    console.error("profile update failed", error);
    return jsonError("unavailable", 503);
  }
}

/** El perfil propio (spec 4a §6.2): lo pide la 404 de `/u/[nick]` cuando el nick es el del jugador. */
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const profile = await getOwnProfile(getDb(), user.id);
    if (!profile) return jsonError("not_found", 404);
    return NextResponse.json(profile, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("own profile failed", error);
    return jsonError("unavailable", 503);
  }
}
