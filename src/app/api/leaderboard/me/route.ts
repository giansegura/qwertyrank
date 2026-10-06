import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { VISIBLE_PERIODS } from "@/lib/leaderboard/periods";
import { INPUT_TYPES } from "@/lib/leaderboard/slugs";
import { TEST_LANGUAGES } from "@/lib/words/languages";
import { getSessionUser } from "@/server/auth/session";
import { jsonError } from "@/server/http";
import { getRanking } from "@/server/leaderboard/instance";
import { currentBoard } from "@/server/leaderboard/store";

const querySchema = z.object({
  lang: z.enum(TEST_LANGUAGES),
  input: z.enum(INPUT_TYPES),
  period: z.enum(VISIBLE_PERIODS),
});

/** Posición del jugador en el ranking en curso de esa combinación; sin caché (spec §5.6). */
export async function GET(request: NextRequest) {
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return jsonError("invalid_query", 400);

  try {
    const user = await getSessionUser(request.headers);
    if (!user) return jsonError("unauthorized", 401);
    const { lang, input, period } = query.data;
    const position = await getRanking().myPosition(user.id, currentBoard(lang, input, period));
    return NextResponse.json(position, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("my position failed", error);
    return jsonError("unavailable", 503);
  }
}
