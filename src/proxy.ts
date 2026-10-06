import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Todo excepto /api, /admin (panel sin idiomas), /trpc, /_next, /_vercel y archivos con extensión.
  matcher: "/((?!api|admin|trpc|_next|_vercel|.*\\..*).*)",
};
