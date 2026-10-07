import { gzipSync } from "node:zlib";
import { loadEnvConfig } from "@next/env";
import { expect, type Page } from "@playwright/test";
import { Redis } from "@upstash/redis";
import postgres from "postgres";

// Mismas variables que el servidor de los E2E (.env.local): misma base de datos y mismo Redis.
loadEnvConfig(process.cwd());

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  automaticDeserialization: false,
});
// Bajo demanda: varios archivos de E2E comparten este módulo en el mismo worker, y el `afterAll`
// de uno cierra la conexión (closeDb) mientras otro aún la necesita.
let client: postgres.Sql | null = null;
const db = () => (client ??= postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} }));

const LOGIN_PATH = { en: "/en/sign-in", es: "/es/entrar", pt: "/pt/entrar" } as const;

/**
 * Cada usuario de los E2E con su propia base de nick (`e2e1a2b3c4d`, primera palabra del email):
 * con una base común, los registros en paralelo se disputan los mismos nicks libres.
 */
export const uniqueEmail = () => `e2e${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}@example.com`;

/**
 * En producción (`pnpm start`) Better Auth limita los enlaces por IP (5 por minuto). Todos los
 * tests salen de 127.0.0.1: cada uno se presenta con una IP propia para no agotar el límite.
 */
export function randomClientIp(): string {
  return `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join(".")}`;
}

/** Último enlace para entrar enviado a ese email (sin Resend, los emails van al buzón de Redis). */
export async function magicLinkFor(email: string): Promise<string> {
  const key = `${process.env.REDIS_KEY_PREFIX ?? "qr:"}outbox:${email.toLowerCase()}`;
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const [latest] = await redis.lrange(key, 0, 0);
        link = latest ? (JSON.parse(latest) as { text: string }).text.match(/https?:\/\/\S+/)?.[0] : undefined;
        return link;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  return link!;
}

/** Ya en la página de entrar: crea una cuenta con el enlace por email y llega a la bienvenida. */
export async function signUpOnLoginPage(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-send").click();
  await expect(page.getByTestId("login-sent")).toBeVisible();
  await page.goto(await magicLinkFor(email));
  await expect(page.getByTestId("profile-form")).toBeVisible();
  return email;
}

/** Crea una cuenta con el enlace por email. La página se queda en la bienvenida. */
export async function signUp(page: Page, locale: keyof typeof LOGIN_PATH = "es"): Promise<string> {
  await page.goto(LOGIN_PATH[locale]);
  return signUpOnLoginPage(page);
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const [row] = await db()<{ id: string }[]>`select id from users where email = ${email}`;
  return row?.id ?? null;
}

export async function verdictsOf(userId: string): Promise<string[]> {
  const rows = await db()<{ verdict: string }[]>`select verdict from games where user_id = ${userId}`;
  return rows.map((row) => row.verdict);
}

/** Cambia el rol de una cuenta directamente en la base de datos. */
export async function setRole(email: string, role: "user" | "admin"): Promise<void> {
  await db()`update users set role = ${role} where email = ${email}`;
}

/** Cambia el estado de una cuenta directamente en la base de datos (sin pasar por el panel). */
export async function setStatus(email: string, status: "active" | "shadowbanned" | "banned"): Promise<void> {
  await db()`update users set status = ${status} where email = ${email}`;
}

/**
 * Un jugador con la mejor marca de siempre en inglés y teclado físico, sin jugar: el top de un ranking
 * se lee de PostgreSQL, así que basta con su partida y su `period_bests`.
 */
export async function seedRankedPlayer(nick: string): Promise<string> {
  const [user] = await db()<{ id: string }[]>`
    insert into users (name, email, nick) values ('', ${`${nick}@example.com`}, ${nick}) returning id`;
  const gameId = crypto.randomUUID();
  const now = new Date();
  await db()`
    insert into games (id, user_id, anon_id, language, input_type, wpm, raw_wpm, accuracy, verdict, starts_at, finished_at)
    values (${gameId}, ${user.id}, ${crypto.randomUUID()}, 'en', 'physical', 250, 250, 99, 'valid', ${now}, ${now})`;
  await db()`
    insert into period_bests (user_id, language, input_type, period_type, period_key, game_id, wpm, accuracy, score, achieved_at)
    values (${user.id}, 'en', 'physical', 'all', 'all', ${gameId}, 250, 99, ${Number.MAX_SAFE_INTEGER}, ${now})`;
  return user.id;
}

/** Eventos de teclear `text` letra a letra, una cada 150 ms, como los guarda el servidor. */
function typingEvents(text: string) {
  return [...text].flatMap((char, i) => {
    const code = char === " " ? "Space" : `Key${char.toUpperCase()}`;
    return [
      { t: i * 150, type: "down", key: char, code, trusted: true },
      { t: i * 150 + 1, type: "input", deleted: 0, inserted: char, trusted: true },
      { t: i * 150 + 60, type: "up", key: char, code, trusted: true },
    ];
  });
}

/** Cómo es el registro de pulsaciones de una partida sembrada: el de la 4b, el anterior, uno roto o ninguno. */
export type SeededLog = "words" | "batches" | "broken" | "none";

/**
 * Una partida de `userId` esperando verificación (como la deja `finish`, spec 4b §2.2), en inglés y
 * teclado físico, con el registro de pulsaciones que se pida. Devuelve la partida y la verificación.
 */
export async function seedPendingVerification(
  userId: string,
  { wpm = 80, log = "words" as SeededLog } = {},
): Promise<{ gameId: string; verificationId: string }> {
  const gameId = crypto.randomUUID();
  const now = new Date();
  await db()`
    insert into games (id, user_id, anon_id, language, input_type, wpm, raw_wpm, accuracy, verdict, starts_at, finished_at)
    values (${gameId}, ${userId}, ${crypto.randomUUID()}, 'en', 'physical', ${wpm}, ${wpm}, 98, 'review', ${now}, ${now})`;
  const batches = [{ seq: 1, arrivedAt: now.getTime(), events: typingEvents("hxla mundo ") }];
  const events = {
    words: gzipSync(JSON.stringify({ words: ["hola", "mundo", "azul"], batches })),
    batches: gzipSync(JSON.stringify(batches)),
    broken: Buffer.from("no es gzip"),
    none: null,
  }[log];
  if (events) await db()`insert into keystroke_logs (game_id, events) values (${gameId}, ${events})`;
  const [row] = await db()<{ id: string }[]>`
    insert into record_verifications (user_id, language, input_type, game_id, expires_at)
    values (${userId}, 'en', 'physical', ${gameId}, now() + interval '24 hours') returning id`;
  await db()`update games set verification_id = ${row.id} where id = ${gameId}`;
  return { gameId, verificationId: row.id };
}

/**
 * Borra la cuenta y la saca de Redis (como al borrarla desde ajustes): las marcas de una prueba no deben
 * quitarle a la siguiente ejecución el top 10 de hoy.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const match = `${process.env.REDIS_KEY_PREFIX ?? "qr:"}lb:*`;
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match, count: 500 });
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keys) pipeline.zrem(key, userId);
      await pipeline.exec();
    }
    cursor = String(next);
  } while (cursor !== "0");
  await db()`delete from users where id = ${userId}`;
}

export async function closeDb(): Promise<void> {
  const open = client;
  client = null;
  await open?.end();
}
