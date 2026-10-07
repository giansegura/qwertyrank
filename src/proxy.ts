import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { isJunkPath } from "./lib/junk-path";

const handleI18n = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // A una ruta que no existe: la 404 general, sin renderizar (ni guardar en caché) la página ISR.
  if (isJunkPath(pathname)) return NextResponse.rewrite(new URL(`/${pathname.split("/")[1]}/404`, request.url));
  return handleI18n(request);
}

export const config = {
  // Todo excepto /api, /admin (panel sin idiomas), /trpc, /_next, /_vercel y archivos con extensión.
  matcher: "/((?!api|admin|trpc|_next|_vercel|.*\\..*).*)",
};
