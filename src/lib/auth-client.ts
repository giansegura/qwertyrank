import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "@/server/auth/auth";

/**
 * Better Auth client. It is heavy: only the sign-in and settings pages import it, never the
 * home page (spec §7.5). The API is on the same origin (/api/auth), so it needs no baseURL.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), magicLinkClient(), passkeyClient()],
});
