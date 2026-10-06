import "server-only";

type Handler = (request: Request) => Promise<Response>;

/** Solo rutas propias: un `errorCallbackURL` manipulado no puede sacar al jugador de la web. */
function isOwnPath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

/**
 * Si al abrir el enlace del email falla la creación de la cuenta (p. ej. dos registros a la vez
 * con el mismo nick propuesto), Better Auth responde un 500 vacío y el enlace ya está gastado.
 * En su lugar se vuelve a la página de entrar con `error=failed`, desde donde se pide otro.
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
