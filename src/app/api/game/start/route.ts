import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, createAnonId } from "@/server/anon";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { HUMAN_COOKIE, HUMAN_PASS_SECONDS } from "@/server/game/human-pass";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService, startGate } from "@/server/game/instance";
import { startBodySchema } from "@/server/game/schemas";
import { clientIp } from "@/server/ip-hash";
import { spendAttempt } from "@/server/verification/attempts";

/** La cookie anónima nueva y el pase humano recién ganado viajan en cualquier respuesta. */
function withCookies(response: NextResponse, anon: { value: string } | null, pass: string | null): NextResponse {
  const secure = process.env.NODE_ENV === "production";
  if (anon) {
    response.cookies.set(ANON_COOKIE, anon.value, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: ANON_COOKIE_MAX_AGE });
  }
  if (pass) {
    response.cookies.set(HUMAN_COOKIE, pass, { httpOnly: true, sameSite: "lax", secure, path: "/api/game", maxAge: HUMAN_PASS_SECONDS });
  }
  return response;
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request, startBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  const existing = readOwner(request);
  const anon = existing ? null : createAnonId(serverEnv().ANON_COOKIE_SECRET);
  const owner = existing ?? anon!.id;

  try {
    // Solo `start` mira la sesión: `keys` y `finish` se autentican con la cookie anónima (spec §4.2).
    const user = await getSessionUser(request.headers);
    // Una verificación es de una cuenta (spec 4b §3.1): sin sesión no se pasa por la puerta ni se gasta nada.
    if (body.mode === "verification" && !user) return withCookies(jsonError("unauthorized", 401), anon, null);
    const gate = await startGate()({
      anonId: owner,
      userId: user?.id ?? null,
      ip: clientIp(request.headers),
      pass: request.cookies.get(HUMAN_COOKIE)?.value,
      turnstileToken: body.turnstileToken,
    });
    if (gate.kind === "needs_challenge") return withCookies(jsonError("needs_challenge", 403), anon, null);
    if (gate.kind === "banned") return withCookies(jsonError("banned", 403), anon, gate.newPass);
    if (gate.kind === "rate_limited") {
      const limited = NextResponse.json({ error: "rate_limited", retryAfter: gate.retryAfter }, { status: 429 });
      return withCookies(limited, anon, gate.newPass);
    }
    // Pasada la puerta, la verificación gasta su intento; uno abandonado o cortado queda gastado.
    let verification: { id: string; attempt: number } | undefined;
    if (body.mode === "verification") {
      const spent = await spendAttempt(getDb(), { verificationId: body.verificationId, userId: user!.id, language: body.language });
      if (!spent) return withCookies(jsonError("no_pending_verification", 409), anon, gate.newPass);
      verification = { id: spent.id, attempt: spent.attempt };
    }
    const game = await gameService().start({
      owner,
      userId: user?.id ?? null,
      language: body.language,
      env: body.env,
      verification,
    });
    return withCookies(NextResponse.json(game), anon, gate.newPass);
  } catch (error) {
    // También Cloudflare caído (TurnstileUnavailableError) o Redis caído: "Ranked no está disponible".
    console.error("start failed", error);
    return jsonError("unavailable", 503);
  }
}
