import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Todo excepto /api, /trpc, /_next, /_vercel y archivos con extensión (favicon.ico, etc.)
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
