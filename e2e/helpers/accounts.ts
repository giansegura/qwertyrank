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

export async function closeDb(): Promise<void> {
  const open = client;
  client = null;
  await open?.end();
}
