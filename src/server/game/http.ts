import "server-only";
import type { NextRequest } from "next/server";
import { ANON_COOKIE, readAnonId } from "../anon";
import { serverEnv } from "../env";

export { jsonError, parseBody } from "../http";

export function readOwner(request: NextRequest): string | null {
  return readAnonId(request.cookies.get(ANON_COOKIE)?.value, serverEnv().ANON_COOKIE_SECRET);
}
