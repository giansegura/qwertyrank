import "server-only";
import { createHash } from "node:crypto";
import { passkey } from "@better-auth/passkey";
import type { Redis } from "@upstash/redis";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { createDeleteUserData } from "../account/delete-user-data";
import { getDb, type Db } from "../db/client";
import { accounts, passkeys, sessions, users, verifications } from "../db/schema";
import { magicLinkEmail } from "../email/magic-link";
import { revalidatePlayerPages } from "../cache";
import { createMailer, type SendEmail } from "../email/mailer";
import { serverEnv } from "../env";
import { createLeaderboardStore } from "../leaderboard/store";
import { accountBlocked, identityHash, isBannedIdentity } from "../moderation/identities";
import { findFreeNick, nickBase } from "../profile/nick";
import { createNickAvailability } from "../profile/nick-reservation";
import { getRedis } from "../redis";
import { isDisposableEmail } from "./disposable";

export const MAGIC_LINK_EXPIRES_SECONDS = 600;
/** Un enlace por email cada 60 s como máximo: que el formulario no sirva para inundar el buzón de nadie. */
export const MAGIC_LINK_INTERVAL_SECONDS = 60;

export interface AuthDeps {
  db: Db;
  redis: Redis;
  keyPrefix: string;
  sendEmail: SendEmail;
  secret: string;
  /** Clave de los hashes de identidades baneadas (spec 4a §3.3); en producción, `IP_HASH_SECRET`. */
  identitySecret: string;
  baseURL: string;
  google?: { clientId: string; clientSecret: string };
  /** Han cambiado páginas en caché de un jugador (al borrar su cuenta); en producción, `revalidatePlayerPages`. */
  onPlayerChanged?: () => void;
  random?: () => number;
}

export function createAuth(deps: AuthDeps) {
  const random = deps.random ?? Math.random;
  const deleteUserData = createDeleteUserData(deps.db, createLeaderboardStore(deps.redis, deps.keyPrefix));
  const isNickTaken = createNickAvailability(deps.db, deps.redis, deps.keyPrefix);

  const isBannedEmail = (email: string) => isBannedIdentity(deps.db, identityHash("email", email, deps.identitySecret));

  /** Solo para cuentas nuevas: un baneado con cuenta sigue pudiendo entrar (spec 4a §3.4). */
  async function isBlockedSignUp(email: string): Promise<boolean> {
    if (!(await isBannedEmail(email))) return false;
    const existing = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    return existing.length === 0;
  }

  const magicLinkKey = (email: string) =>
    `${deps.keyPrefix}magic-link:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;

  /**
   * Un enlace por email y minuto. Se comprueba al enviar, no al recibir la petición: así una
   * petición inválida no gasta el envío del minuto (ni sirve para bloquear a otro), y si el
   * proveedor falla se libera para que el jugador pueda reintentar enseguida.
   */
  async function sendMagicLinkThrottled(email: string, url: string): Promise<void> {
    const key = magicLinkKey(email);
    if ((await deps.redis.set(key, "1", { nx: true, ex: MAGIC_LINK_INTERVAL_SECONDS })) === null) {
      throw new APIError("TOO_MANY_REQUESTS", { code: "EMAIL_THROTTLED", message: "Wait a minute before asking for another link" });
    }
    try {
      await deps.sendEmail(await magicLinkEmail(email, url));
    } catch (error) {
      await deps.redis.del(key);
      throw error;
    }
  }

  return betterAuth({
    appName: "QwertyRank",
    baseURL: deps.baseURL,
    secret: deps.secret,
    database: drizzleAdapter(deps.db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications, passkeys },
      usePlural: true,
      transaction: true,
    }),
    advanced: { database: { generateId: "uuid" }, cookiePrefix: "qr" },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    user: {
      // Mismos valores que USER_ROLES y USER_STATUSES del esquema; Better Auth necesita los literales.
      additionalFields: {
        nick: { type: "string", required: true, input: false },
        country: { type: "string", required: false, input: false },
        // No salen en la sesión que ve el navegador: un shadow-ban no debe notarse (spec §4.7).
        role: { type: ["user", "admin"], required: true, defaultValue: "user", input: false, returned: false },
        status: {
          type: ["active", "shadowbanned", "banned"],
          required: true,
          defaultValue: "active",
          input: false,
          returned: false,
        },
      },
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await deleteUserData(user.id);
        },
        // Ya sin el usuario: sus páginas en caché (perfil y rankings) se regeneran sin él.
        afterDelete: async () => {
          deps.onPlayerChanged?.();
        },
      },
    },
    socialProviders: { google: deps.google },
    databaseHooks: {
      user: {
        create: {
          // Toda cuenta nace con un nick válido y libre (spec §3.6); el jugador lo cambia en la bienvenida.
          before: async (user) => {
            if (await isBannedEmail(user.email)) throw accountBlocked();
            return { data: { ...user, nick: await findFreeNick(nickBase(user.email, user.name), isNickTaken, random) } };
          },
        },
      },
      account: {
        create: {
          // Google crea el usuario y la cuenta en una transacción: si esto lanza, no queda nada a medias.
          before: async (account) => {
            const banned =
              account.providerId === "google" &&
              (await isBannedIdentity(deps.db, identityHash("google", account.accountId, deps.identitySecret)));
            if (banned) throw accountBlocked();
            return { data: account };
          },
        },
      },
      session: {
        create: {
          // La IP solo se guarda como hash (spec §6): en las sesiones no hace falta.
          before: async (session) => ({ data: { ...session, ipAddress: null } }),
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/magic-link") return;
        const email = String(ctx.body?.email ?? "");
        if (isDisposableEmail(email)) {
          throw new APIError("BAD_REQUEST", { code: "DISPOSABLE_EMAIL", message: "Disposable email addresses are not allowed" });
        }
        if (await isBlockedSignUp(email)) throw accountBlocked();
      }),
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRES_SECONDS,
        sendMagicLink: ({ email, url }) => sendMagicLinkThrottled(email, url),
      }),
      // rpID sale del host de baseURL. La passkey sirve para entrar; no crea cuentas.
      passkey({ rpName: "QwertyRank" }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | null = null;

export function getAuth(): Auth {
  if (auth) return auth;
  const env = serverEnv();
  auth = createAuth({
    db: getDb(),
    redis: getRedis(),
    keyPrefix: env.REDIS_KEY_PREFIX,
    sendEmail: createMailer(env, getRedis()),
    secret: env.BETTER_AUTH_SECRET,
    identitySecret: env.IP_HASH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    onPlayerChanged: revalidatePlayerPages,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
  });
  return auth;
}
