import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "@/server/auth/auth";

/**
 * Cliente de Better Auth. Pesa: solo lo importan las páginas de entrar y de ajustes, nunca la
 * portada (spec §7.5). La API está en el mismo origen (/api/auth), así que no necesita baseURL.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), magicLinkClient(), passkeyClient()],
});
