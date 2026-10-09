import "server-only";
import { createHmac } from "node:crypto";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "../db/client";
import { accounts, bannedIdentities, users } from "../db/schema";

export type IdentityKind = "email" | "google";

/** Email as it is compared (spec 4a §3.3): lowercase, without `+tag` and, on Gmail, without dots. */
export function normalizeEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  const local = clean.slice(0, at).split("+")[0];
  const rawDomain = clean.slice(at + 1);
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  return `${domain === "gmail.com" ? local.replaceAll(".", "") : local}@${domain}`;
}

/** HMAC of the identity with its own key derived from the secret: never stored in plain text. */
export function identityHash(kind: IdentityKind, value: string, secret: string): string {
  const key = createHmac("sha256", secret).update("banned-identity").digest();
  const normalized = kind === "email" ? normalizeEmail(value) : `google:${value}`;
  return createHmac("sha256", key).update(normalized).digest("hex");
}

/** A user's identities: their email and their Google accounts. */
export async function identitiesOf(
  db: DbExecutor,
  userId: string,
  secret: string,
): Promise<{ kind: IdentityKind; hash: string }[]> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!user) return [];
  const google = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google")));
  return [
    { kind: "email", hash: identityHash("email", user.email, secret) },
    ...google.map((account) => ({ kind: "google" as const, hash: identityHash("google", account.accountId, secret) })),
  ];
}

export async function isBannedIdentity(db: DbExecutor, hash: string): Promise<boolean> {
  const rows = await db
    .select({ hash: bannedIdentities.hash })
    .from(bannedIdentities)
    .where(eq(bannedIdentities.hash, hash))
    .limit(1);
  return rows.length > 0;
}

/** Better Auth error: the sign-in page translates it as "This account can't be created". */
export function accountBlocked(): APIError {
  return new APIError("FORBIDDEN", { code: "ACCOUNT_BLOCKED", message: "This account cannot be created" });
}
