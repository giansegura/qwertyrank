import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { bannedIdentities, games, keystrokeLogs, periodBests, sessions, users } from "../db/schema";
import type { EmailMessage } from "../email/mailer";
import { createSaveGame } from "../game/persist";
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
    if (emailProviderDown) throw new Error("proveedor de email caído");
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
  if (!message) throw new Error(`no hay email para ${email}`);
  return message.text.match(/https?:\/\/\S+/)![0];
}

/** `qr.session_token=…` de la respuesta, listo para mandarlo en la cabecera `cookie`. */
function sessionCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("qr.session_token="));
  if (!cookie) throw new Error("la respuesta no abre sesión");
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

describe("cuentas con Better Auth", () => {
  it("el enlace por email crea la cuenta con un nick válido, abre sesión y no guarda la IP", async () => {
    const email = newEmail();
    const { response, user } = await signIn(email);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/\/es\/ajustes\?welcome=1$/);
    expect(user.email).toBe(email);
    expect(checkNick(user.nick)).toBeNull();
    const [row] = await db.select({ ip: sessions.ipAddress }).from(sessions).where(eq(sessions.userId, user.id));
    expect(row.ip).toBeNull();
  });

  it("el enlace solo funciona una vez", async () => {
    const email = newEmail();
    await askForLink(email);
    const link = linkSentTo(email);
    await auth.handler(new Request(link));
    const again = await auth.handler(new Request(link));
    expect(again.headers.get("location")).toMatch(/error=INVALID_TOKEN/);
  });

  it("un email desechable no recibe enlace", async () => {
    await expect(askForLink("alguien@mailinator.com")).rejects.toMatchObject({ body: { code: "DISPOSABLE_EMAIL" } });
    expect(outbox.some((m) => m.to === "alguien@mailinator.com")).toBe(false);
  });

  it("solo manda un enlace por minuto al mismo email", async () => {
    const email = newEmail();
    await askForLink(email);
    await expect(askForLink(email)).rejects.toMatchObject({ body: { code: "EMAIL_THROTTLED" } });
  });

  it("si el proveedor de email falla, se puede pedir otro enlace enseguida", async () => {
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

  it("una petición inválida no gasta el envío del minuto (no sirve para bloquear a otro)", async () => {
    const email = newEmail();
    await expect(
      auth.api.signInMagicLink({ body: { email, name: 123 } as never, headers: new Headers() }),
    ).rejects.toThrow();
    await askForLink(email);
    expect(outbox.some((m) => m.to === email)).toBe(true);
  });

  it("si el proveedor de email falla, la petición falla (el jugador no ve 'enviado')", async () => {
    emailProviderDown = true;
    try {
      await expect(askForLink(newEmail())).rejects.toThrow();
    } finally {
      emailProviderDown = false;
    }
  });

  it("borrar la cuenta borra sus pulsaciones y anonimiza sus partidas", async () => {
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

  it("borrar la cuenta con una sesión de hace más de un día exige volver a entrar", async () => {
    const { headers, user } = await signIn(newEmail());
    await db
      .update(sessions)
      // Se envejecen las dos fechas: la antigüedad de la sesión puede medirse con cualquiera de ellas.
      .set({ createdAt: sql`now() - interval '2 days'`, updatedAt: sql`now() - interval '2 days'` })
      .where(eq(sessions.userId, user.id));
    await expect(auth.api.deleteUser({ body: {}, headers })).rejects.toMatchObject({
      body: { code: "SESSION_EXPIRED" },
    });
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, user.id))).toHaveLength(1);
  });

  it("si falla la creación de la cuenta al abrir el enlace, vuelve a entrar con un error (no un 500 en blanco)", async () => {
    // Con random() = 0 los candidatos son siempre base_00 y base_0000: si están ocupados, no hay nick libre.
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

    // Sin la red de seguridad, Better Auth responde un 500 vacío (y el enlace ya está gastado).
    expect((await unlucky.handler(await linkFor(`${base}@example.com`))).status).toBe(500);

    const response = await withSignInFallback(unlucky.handler)(await linkFor(`${base}+2@example.com`));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/es/entrar");
    expect(location.searchParams.get("error")).toBe("failed");
    expect(location.searchParams.get("next")).toBe("/es");
  });

  it("borrar la cuenta la quita de todos los rankings (los demás suben)", async () => {
    const { headers, user } = await signIn(newEmail());
    await verifyEverywhere(db, user.id);
    const store = createLeaderboardStore(redis, process.env.REDIS_KEY_PREFIX!);
    const startsAt = new Date();
    const saved = await createSaveGame(db)({
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
    const boards = saved.improved.map((best) => ({
      language: "en" as const,
      inputType: "touch" as const,
      period: best.period,
      key: best.key,
    }));
    await store.add(boards.map((board, i) => ({ board, userId: user.id, score: saved.improved[i].score, achievedAt: startsAt })));

    await auth.api.deleteUser({ body: {}, headers });

    for (const board of boards) expect(await store.position(board, user.id)).toBeNull();
    expect(await db.select().from(periodBests).where(eq(periodBests.userId, user.id))).toEqual([]);
  });

  it("la sesión que ve el navegador no incluye status ni role", async () => {
    const { headers } = await signIn(newEmail());
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/get-session", { headers }));
    const { user } = (await response.json()) as { user: Record<string, unknown> };
    expect(user).toHaveProperty("nick");
    expect(user).not.toHaveProperty("status");
    expect(user).not.toHaveProperty("role");
  });

  it("borrar la cuenta avisa de que cambian sus páginas en caché (perfil y rankings)", async () => {
    const { headers } = await signIn(newEmail());
    const before = playerChanges;
    await auth.api.deleteUser({ body: {}, headers });
    expect(playerChanges).toBe(before + 1);
  });

  async function ban(kind: "email" | "google", value: string) {
    await db.insert(bannedIdentities).values({ hash: identityHash(kind, value, deps.identitySecret), kind });
  }

  /** Olvida el "un enlace por minuto" de ese email, para volver a entrar en el mismo test. */
  async function forgetThrottle(email: string) {
    await redis.del(`${deps.keyPrefix}magic-link:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`);
  }

  it("un email baneado (o un alias suyo) no puede pedir enlace para una cuenta nueva", async () => {
    const local = randomUUID().replaceAll("-", "").slice(0, 12);
    await ban("email", `${local}@gmail.com`);
    const alias = `${local.slice(0, 4)}.${local.slice(4)}+otra@googlemail.com`;
    await expect(askForLink(alias)).rejects.toMatchObject({ body: { code: "ACCOUNT_BLOCKED" } });
    expect(outbox.some((message) => message.to === alias)).toBe(false);
  });

  it("un baneado que ya tiene cuenta sigue pudiendo entrar", async () => {
    const email = newEmail();
    await signIn(email);
    await ban("email", email);
    await forgetThrottle(email);
    const { user } = await signIn(email);
    expect(user.email).toBe(email);
  });

  it("si se banea el email entre pedir el enlace y abrirlo, vuelve con ACCOUNT_BLOCKED y no crea la cuenta", async () => {
    const email = newEmail();
    await askForLink(email);
    await ban("email", email);
    const response = await auth.handler(new Request(linkSentTo(email)));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=ACCOUNT_BLOCKED");
    expect(await db.select().from(users).where(eq(users.email, email))).toEqual([]);
  });

  it("una cuenta de Google baneada no crea el usuario (ni lo deja a medias)", async () => {
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
