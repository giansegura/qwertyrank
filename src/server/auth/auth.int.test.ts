import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { bannedIdentities, bests, games, keystrokeLogs, sessions, users } from "../db/schema";
import type { EmailMessage } from "../email/mailer";
import { createSaveGame } from "../game/persist";
import { activeBests } from "../leaderboard/live";
import { createLeaderboardStore } from "../leaderboard/store";
import { identityHash } from "../moderation/identities";
import { checkNick } from "../profile/nick";
import { createRedis } from "../redis";
import { createAuth } from "./auth";
import { withSignInFallback } from "./sign-in-fallback";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const outbox: EmailMessage[] = [];
let playerChanges = 0;
let emailProviderDown = false;

const deps = {
  db,
  redis,
  keyPrefix: process.env.REDIS_KEY_PREFIX!,
  secret: process.env.BETTER_AUTH_SECRET!,
  identitySecret: process.env.IP_HASH_SECRET!,
  baseURL: "http://localhost:3000",
  onPlayerChanged: () => {
    playerChanges++;
  },
  sendEmail: async (message: EmailMessage) => {
    if (emailProviderDown) throw new Error("email provider down");
    outbox.push(message);
  },
};
const auth = createAuth(deps);

afterAll(async () => {
  await db.$client.end();
});

const newEmail = () => `${randomUUID()}@example.com`;

function linkSentTo(email: string): string {
  const message = outbox.findLast((m) => m.to === email);
  if (!message) throw new Error(`no email for ${email}`);
  return message.text.match(/https?:\/\/\S+/)![0];
}

/** `qr.session_token=…` from the response, ready to send in the `cookie` header. */
function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("qr.session_token="));
  if (!cookie) throw new Error("the response does not open a session");
  return cookie;
}

function askForLink(email: string, callbackURL = "/es") {
  return auth.api.signInMagicLink({
    body: { email, callbackURL, newUserCallbackURL: "/es/ajustes?welcome=1" },
    headers: new Headers(),
  });
}

async function signIn(email: string) {
  await askForLink(email);
  const response = await auth.handler(new Request(linkSentTo(email)));
  const headers = new Headers({ cookie: sessionCookie(response) });
  const session = await auth.api.getSession({ headers });
  return { response, headers, user: session!.user };
}

describe("accounts with Better Auth", () => {
  it("the email link creates the account with a valid nick, opens a session and does not store the IP", async () => {
    const email = newEmail();
    const { response, user } = await signIn(email);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/\/es\/ajustes\?welcome=1$/);
    expect(user.email).toBe(email);
    expect(checkNick(user.nick)).toBeNull();
    const [row] = await db.select({ ip: sessions.ipAddress }).from(sessions).where(eq(sessions.userId, user.id));
    expect(row.ip).toBeNull();
  });

  it("the link only works once", async () => {
    const email = newEmail();
    await askForLink(email);
    const link = linkSentTo(email);
    await auth.handler(new Request(link));
    const again = await auth.handler(new Request(link));
    expect(again.headers.get("location")).toMatch(/error=INVALID_TOKEN/);
  });

  it("a disposable email does not get a link", async () => {
    await expect(askForLink("someone@mailinator.com")).rejects.toMatchObject({ body: { code: "DISPOSABLE_EMAIL" } });
    expect(outbox.some((m) => m.to === "someone@mailinator.com")).toBe(false);
  });

  it("only sends one link per minute to the same email", async () => {
    const email = newEmail();
    await askForLink(email);
    await expect(askForLink(email)).rejects.toMatchObject({ body: { code: "EMAIL_THROTTLED" } });
  });

  it("if the email provider fails, another link can be requested right away", async () => {
    const email = newEmail();
    emailProviderDown = true;
    try {
      await expect(askForLink(email)).rejects.toThrow();
    } finally {
      emailProviderDown = false;
    }
    await askForLink(email);
    expect(outbox.some((m) => m.to === email)).toBe(true);
  });

  it("an invalid request does not use up the minute's send (it cannot block someone else)", async () => {
    const email = newEmail();
    await expect(
      auth.api.signInMagicLink({ body: { email, name: 123 } as never, headers: new Headers() }),
    ).rejects.toThrow();
    await askForLink(email);
    expect(outbox.some((m) => m.to === email)).toBe(true);
  });

  it("if the email provider fails, the request fails (the player does not see 'sent')", async () => {
    emailProviderDown = true;
    try {
      await expect(askForLink(newEmail())).rejects.toThrow();
    } finally {
      emailProviderDown = false;
    }
  });

  it("deleting the account deletes its keystrokes and anonymizes its games", async () => {
    const { headers, user } = await signIn(newEmail());
    await verifyEverywhere(db, user.id);
    const gameId = randomUUID();
    await createSaveGame(db)({
      id: gameId,
      userId: user.id,
      anonId: randomUUID(),
      language: "es",
      inputType: "physical",
      wpm: 60,
      rawWpm: 61,
      accuracy: 97,
      verdict: "valid",
      rejectReason: null,
      ipHash: "hash",
      startsAt: new Date(),
      finishedAt: new Date(),
      words: [],
      batches: [],
    });

    await auth.api.deleteUser({ body: {}, headers });

    expect(await db.select().from(users).where(eq(users.id, user.id))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
    expect(await db.select().from(keystrokeLogs).where(eq(keystrokeLogs.gameId, gameId))).toEqual([]);
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    expect(game).toMatchObject({ userId: null, anonId: null, ipHash: null, wpm: 60 });
  });

  it("deleting the account with a session older than a day requires signing in again", async () => {
    const { headers, user } = await signIn(newEmail());
    await db
      .update(sessions)
      // Both dates are aged: the session's age can be measured with either of them.
      .set({ createdAt: sql`now() - interval '2 days'`, updatedAt: sql`now() - interval '2 days'` })
      .where(eq(sessions.userId, user.id));
    await expect(auth.api.deleteUser({ body: {}, headers })).rejects.toMatchObject({
      body: { code: "SESSION_EXPIRED" },
    });
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, user.id))).toHaveLength(1);
  });

  it("if account creation fails when opening the link, it goes back to sign-in with an error (not a blank 500)", async () => {
    // With random() = 0 the candidates are always base_00 and base_0000: if they are taken, there is no free nick.
    const base = `z${randomUUID().replaceAll("-", "").slice(0, 11)}`;
    for (const nick of [`${base}_00`, `${base}_0000`]) {
      await db.insert(users).values({ name: "", email: `${randomUUID()}@example.com`, nick });
    }
    const unlucky = createAuth({ ...deps, random: () => 0 });
    const linkFor = async (email: string) => {
      await unlucky.api.signInMagicLink({
        body: { email, callbackURL: "/es", errorCallbackURL: "/es/entrar?next=%2Fes" },
        headers: new Headers(),
      });
      return new Request(linkSentTo(email));
    };

    // Without the safety net, Better Auth responds with an empty 500 (and the link is already used up).
    expect((await unlucky.handler(await linkFor(`${base}@example.com`))).status).toBe(500);

    const response = await withSignInFallback(unlucky.handler)(await linkFor(`${base}+2@example.com`));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/es/entrar");
    expect(location.searchParams.get("error")).toBe("failed");
    expect(location.searchParams.get("next")).toBe("/es");
  });

  it("deleting the account removes it from every ranking (everyone else moves up)", async () => {
    const { headers, user } = await signIn(newEmail());
    await verifyEverywhere(db, user.id);
    const store = createLeaderboardStore(redis, process.env.REDIS_KEY_PREFIX!);
    const startsAt = new Date();
    await createSaveGame(db)({
      id: randomUUID(),
      userId: user.id,
      anonId: randomUUID(),
      language: "en",
      inputType: "touch",
      wpm: 50,
      rawWpm: 50,
      accuracy: 99,
      verdict: "valid",
      rejectReason: null,
      ipHash: null,
      startsAt,
      finishedAt: startsAt,
      words: [],
      batches: [],
    });
    const board = { language: "en" as const, inputType: "touch" as const };
    await store.add(await activeBests(db, user.id));
    expect(await store.position(board, user.id)).not.toBeNull();

    await auth.api.deleteUser({ body: {}, headers });

    expect(await store.position(board, user.id)).toBeNull();
    expect(await db.select().from(bests).where(eq(bests.userId, user.id))).toEqual([]);
  });

  it("the session the browser sees includes neither status nor role", async () => {
    const { headers } = await signIn(newEmail());
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/get-session", { headers }));
    const { user } = (await response.json()) as { user: Record<string, unknown> };
    expect(user).toHaveProperty("nick");
    expect(user).not.toHaveProperty("status");
    expect(user).not.toHaveProperty("role");
  });

  it("deleting the account signals that its cached pages change (profile and rankings)", async () => {
    const { headers } = await signIn(newEmail());
    const before = playerChanges;
    await auth.api.deleteUser({ body: {}, headers });
    expect(playerChanges).toBe(before + 1);
  });

  async function ban(kind: "email" | "google", value: string) {
    await db.insert(bannedIdentities).values({ hash: identityHash(kind, value, deps.identitySecret), kind });
  }

  /** Forgets the "one link per minute" of that email, to sign in again in the same test. */
  async function forgetThrottle(email: string) {
    await redis.del(`${deps.keyPrefix}magic-link:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`);
  }

  it("a banned email (or an alias of it) cannot request a link for a new account", async () => {
    const local = randomUUID().replaceAll("-", "").slice(0, 12);
    await ban("email", `${local}@gmail.com`);
    const alias = `${local.slice(0, 4)}.${local.slice(4)}+other@googlemail.com`;
    await expect(askForLink(alias)).rejects.toMatchObject({ body: { code: "ACCOUNT_BLOCKED" } });
    expect(outbox.some((message) => message.to === alias)).toBe(false);
  });

  it("a banned player who already has an account can still sign in", async () => {
    const email = newEmail();
    await signIn(email);
    await ban("email", email);
    await forgetThrottle(email);
    const { user } = await signIn(email);
    expect(user.email).toBe(email);
  });

  it("if the email is banned between requesting the link and opening it, it returns ACCOUNT_BLOCKED and does not create the account", async () => {
    const email = newEmail();
    await askForLink(email);
    await ban("email", email);
    const response = await auth.handler(new Request(linkSentTo(email)));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=ACCOUNT_BLOCKED");
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });

  it("a banned Google account does not create the user (nor leave it half-done)", async () => {
    const googleId = randomUUID();
    await ban("google", googleId);
    const email = newEmail();
    const context = await auth.$context;
    await expect(
      context.internalAdapter.createOAuthUser(
        { email, name: "Gian", emailVerified: true } as never,
        { providerId: "google", accountId: googleId } as never,
      ),
    ).rejects.toMatchObject({ body: { code: "ACCOUNT_BLOCKED" } });
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });
});
