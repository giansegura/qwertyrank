import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { isJunkPath } from "./lib/junk-path";

const handleI18n = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // To a route that does not exist: the general 404, without rendering (or caching) the ISR page.
  if (isJunkPath(pathname)) return NextResponse.rewrite(new URL(`/${pathname.split("/")[1]}/404`, request.url));
  return handleI18n(request);
}

export const config = {
  // Everything except /api, /admin (panel without languages), /trpc, /_next, /_vercel and files with an extension.
  matcher: "/((?!api|admin|trpc|_next|_vercel|.*\\..*).*)",
};
