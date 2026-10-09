import { gzipSync } from "node:zlib";
import { loadEnvConfig } from "@next/env";
import { expect, type Page } from "@playwright/test";
import { Redis } from "@upstash/redis";
import postgres from "postgres";

// Same variables as the E2E server (.env.local): same database and same Redis.
loadEnvConfig(process.cwd());

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  automaticDeserialization: false,
});
// On demand: several E2E files share this module in the same worker, and one file's `afterAll`
// closes the connection (closeDb) while another still needs it.
let client: postgres.Sql | null = null;
const db = () => (client ??= postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} }));

const LOGIN_PATH = { en: "/en/sign-in", es: "/es/entrar", pt: "/pt/entrar" } as const;

/**
 * Each E2E user with its own nick base (`e2e1a2b3c4d`, first word of the email):
 * with a shared base, parallel sign-ups compete for the same free nicks.
 */
export const uniqueEmail = () => `e2e${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}@example.com`;

/**
 * In production (`pnpm start`) Better Auth rate-limits links per IP (5 per minute). Every
 * test comes from 127.0.0.1: each one presents its own IP so as not to use up the limit.
 */
export function randomClientIp(): string {
  return `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join(".")}`;
}

/** Last sign-in link sent to that email (without Resend, emails go to the Redis outbox). */
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

/** Already on the sign-in page: creates an account with the email link and reaches the welcome page. */
export async function signUpOnLoginPage(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-send").click();
  await expect(page.getByTestId("login-sent")).toBeVisible();
  await page.goto(await magicLinkFor(email));
  await expect(page.getByTestId("profile-form")).toBeVisible();
  return email;
}

/** Creates an account with the email link. The page stays on the welcome page. */
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

/** Changes an account's role directly in the database. */
export async function setRole(email: string, role: "user" | "admin"): Promise<void> {
  await db()`update users set role = ${role} where email = ${email}`;
}

/** Changes an account's status directly in the database (without going through the panel). */
export async function setStatus(email: string, status: "active" | "shadowbanned" | "banned"): Promise<void> {
  await db()`update users set status = ${status} where email = ${email}`;
}

/**
 * A player with the best in English and physical keyboard, without playing: a leaderboard's top is read
 * from PostgreSQL, so their game and their `bests` row are enough.
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
    insert into bests (user_id, language, input_type, game_id, wpm, accuracy, score, achieved_at)
    values (${user.id}, 'en', 'physical', ${gameId}, 250, 99, ${Number.MAX_SAFE_INTEGER}, ${now})`;
  return user.id;
}

/** A valid Ranked game in Spanish with a physical keyboard, anonymous or by `userId`. Returns its id. */
export async function seedGame(userId: string | null): Promise<string> {
  const gameId = crypto.randomUUID();
  const now = new Date();
  await db()`
    insert into games (id, user_id, anon_id, language, input_type, wpm, raw_wpm, accuracy, verdict, starts_at, finished_at)
    values (${gameId}, ${userId}, ${crypto.randomUUID()}, 'es', 'physical', 72.4, 74, 96.8, 'valid', ${now}, ${now})`;
  return gameId;
}

/** Events for typing `text` letter by letter, one every 150 ms, as the server stores them. */
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

/** What a seeded game's keystroke log looks like: the 4b one, the previous one, a broken one or none. */
export type SeededLog = "words" | "batches" | "broken" | "none";

/**
 * A game by `userId` awaiting verification (as `finish` leaves it, spec 4b §2.2), in English with a
 * physical keyboard, with the requested keystroke log. Returns the game and the verification.
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
    broken: Buffer.from("not gzip"),
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
 * Deletes the account with its games and removes it from Redis: one test's records must not take the
 * top 10 from the next. Unlike deleting it from settings, its games also go and, by cascade, their
 * keystroke logs and verifications: so they don't pile up. Before the games, its bests (`bests`),
 * which reference them without cascade.
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
  await db()`delete from bests where user_id = ${userId}`;
  await db()`delete from games where user_id = ${userId}`;
  await db()`delete from users where id = ${userId}`;
}

/** A player without a real account (no email to open), only in the database. */
export async function seedPlayer(nick: string): Promise<string> {
  const [user] = await db()<{ id: string }[]>`
    insert into users (name, email, nick) values ('', ${`${nick}@example.com`}, ${nick}) returning id`;
  return user.id;
}

/** Gives a player a verified level (spec 4b §5.1) without playing its verification. */
export async function seedVerifiedLevel(
  userId: string,
  { language, inputType, wpm }: { language: "en" | "es" | "pt"; inputType: "physical" | "touch"; wpm: number },
): Promise<void> {
  await db()`
    insert into verified_levels (user_id, language, input_type, wpm)
    values (${userId}, ${language}, ${inputType}, ${wpm})`;
}

/**
 * A rejected game by `userId`, in English with a physical keyboard, with the keystroke log `log` as is:
 * unvalidated, like one sent by a cheater. Returns its id.
 */
export async function seedRejectedGame(userId: string, log: unknown): Promise<string> {
  const gameId = crypto.randomUUID();
  const now = new Date();
  await db()`
    insert into games (id, user_id, anon_id, language, input_type, wpm, raw_wpm, accuracy, verdict, reject_reason, starts_at, finished_at)
    values (${gameId}, ${userId}, ${crypto.randomUUID()}, 'en', 'physical', 0, 0, 0, 'rejected', 'fabricated_timing', ${now}, ${now})`;
  await db()`insert into keystroke_logs (game_id, events) values (${gameId}, ${gzipSync(JSON.stringify(log))})`;
  return gameId;
}

/**
 * Verified level of 1,000 WPM in every language and keyboard (spec 4b §2.1): their games never await
 * verification, even if they enter the top 10 of the E2E database.
 */
export async function seedVerifiedLevels(email: string): Promise<void> {
  await db()`
    insert into verified_levels (user_id, language, input_type, wpm)
    select users.id, l.language, i.input_type, 1000 from users,
      (values ('en'), ('es'), ('pt')) as l(language), (values ('physical'), ('touch')) as i(input_type)
    where users.email = ${email}
    on conflict do nothing`;
}

export async function closeDb(): Promise<void> {
  const open = client;
  client = null;
  await open?.end();
}
