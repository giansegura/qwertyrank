import "server-only";

type Handler = (request: Request) => Promise<Response>;

/** Own paths only: a tampered `errorCallbackURL` cannot take the player off the site. */
function isOwnPath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

/**
 * If account creation fails when opening the email link (e.g. two sign-ups at once with the
 * same proposed nick), Better Auth responds with an empty 500 and the link is already used up.
 * Instead, go back to the sign-in page with `error=failed`, where another one can be requested.
 */
export function withSignInFallback(handler: Handler): Handler {
  return async (request) => {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/magic-link/verify")) return handler(request);
    const response = await handler(request).catch((error: unknown) => {
      console.error("magic link verify failed", error);
      return null;
    });
    if (response && response.status < 500) return response;
    const target = url.searchParams.get("errorCallbackURL");
    const location = new URL(isOwnPath(target) ? target : "/", url.origin);
    location.searchParams.set("error", "failed");
    return Response.redirect(location, 302);
  };
}
