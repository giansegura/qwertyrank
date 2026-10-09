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
/** At most one link per email every 60 s: the form must not be usable to flood anyone's inbox. */
export const MAGIC_LINK_INTERVAL_SECONDS = 60;

export interface AuthDeps {
  db: Db;
  redis: Redis;
  keyPrefix: string;
  sendEmail: SendEmail;
  secret: string;
  /** Key for the hashes of banned identities (spec 4a §3.3); in production, `IP_HASH_SECRET`. */
  identitySecret: string;
  baseURL: string;
  /** Origins accepted besides the `baseURL` one (the unique URL of a preview deployment, spec 5a §2.3). */
  trustedOrigins?: string[];
  google?: { clientId: string; clientSecret: string };
  /** A player's cached pages have changed (on account deletion); in production, `revalidatePlayerPages`. */
  onPlayerChanged?: () => void;
  random?: () => number;
}

export function createAuth(deps: AuthDeps) {
  const random = deps.random ?? Math.random;
  const deleteUserData = createDeleteUserData(deps.db, createLeaderboardStore(deps.redis, deps.keyPrefix));
  const isNickTaken = createNickAvailability(deps.db, deps.redis, deps.keyPrefix);

  const isBannedEmail = (email: string) => isBannedIdentity(deps.db, identityHash("email", email, deps.identitySecret));

  /** Only for new accounts: a banned player with an account can still sign in (spec 4a §3.4). */
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
   * One link per email per minute. It is checked when sending, not when the request arrives: that way
   * an invalid request does not use up the minute's send (nor can it be used to block someone else),
   * and if the provider fails it is released so the player can retry right away.
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
    trustedOrigins: deps.trustedOrigins,
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
      // Same values as USER_ROLES and USER_STATUSES in the schema; Better Auth needs the literals.
      additionalFields: {
        nick: { type: "string", required: true, input: false },
        country: { type: "string", required: false, input: false },
        // Not included in the session the browser sees: a shadow ban must not be noticeable (spec §4.7).
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
        // With the user gone: their cached pages (profile and rankings) are regenerated without them.
        afterDelete: async () => {
          deps.onPlayerChanged?.();
        },
      },
    },
    socialProviders: { google: deps.google },
    databaseHooks: {
      user: {
        create: {
          // Every account is born with a valid, free nick (spec §3.6); the player changes it on the welcome page.
          before: async (user) => {
            if (await isBannedEmail(user.email)) throw accountBlocked();
            return { data: { ...user, nick: await findFreeNick(nickBase(user.email, user.name), isNickTaken, random) } };
          },
        },
      },
      account: {
        create: {
          // Google creates the user and the account in one transaction: if this throws, nothing is left half-done.
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
          // The IP is only stored as a hash (spec §6): sessions don't need it.
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
      // rpID comes from the baseURL host. The passkey is for signing in; it does not create accounts.
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
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
    onPlayerChanged: revalidatePlayerPages,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
  });
  return auth;
}
