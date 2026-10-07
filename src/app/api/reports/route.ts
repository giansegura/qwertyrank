import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { jsonError, parseBody } from "@/server/http";
import { getReports } from "@/server/moderation/instance";
import { reportBodySchema } from "@/server/moderation/reports";

export async function POST(request: NextRequest) {
  const body = await parseBody(request, reportBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const outcome = await getReports()(user.id, body.nick, body.reason);
    if (outcome.kind === "not_found") return jsonError("not_found", 404);
    if (outcome.kind === "self") return jsonError("self", 400);
    if (outcome.kind === "rate_limited") {
      return NextResponse.json({ error: "rate_limited", retryAfter: outcome.retryAfter }, { status: 429 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("report failed", error);
    return jsonError("unavailable", 503);
  }
}
