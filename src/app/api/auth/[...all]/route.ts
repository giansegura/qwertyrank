import { getAuth } from "@/server/auth/auth";
import { withSignInFallback } from "@/server/auth/sign-in-fallback";

const handleGet = withSignInFallback((request) => getAuth().handler(request));

/** Todas las rutas de Better Auth: /api/auth/sign-in/magic-link, /api/auth/get-session, /api/auth/passkey/… */
export function GET(request: Request) {
  return handleGet(request);
}

export function POST(request: Request) {
  return getAuth().handler(request);
}
