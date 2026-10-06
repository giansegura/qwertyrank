import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { games, keystrokeLogs, sessions, users } from "../db/schema";
import type { EmailMessage } from "../email/mailer";
import { createSaveGame } from "../game/persist";
import { checkNick } from "../profile/nick";
import { createRedis } from "../redis";
import { createAuth } from "./auth";
import { withSignInFallback } from "./sign-in-fallback";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const outbox: EmailMessage[] = [];
let emailProviderDown = false;

const deps = {
  db,
  redis,
  keyPrefix: process.env.REDIS_KEY_PREFIX!,
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: "http://localhost:3000",
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
});
