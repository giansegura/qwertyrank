import { expect, test, type Page } from "@playwright/test";
import {
  closeDb,
  deleteAccount,
  randomClientIp,
  seedPendingVerification,
  signUp,
  userIdByEmail,
  verdictsOf,
} from "./helpers/accounts";
import { startRanked } from "./helpers/ranked";

test.describe.configure({ timeout: 120_000 });

/** Cuentas de cada prueba: se borran al acabar, para que sus marcas no ocupen el top 10 de la siguiente. */
const created: string[] = [];

test.afterEach(async () => {
  for (const userId of created.splice(0)) await deleteAccount(userId);
});

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

/** Crea una cuenta en inglés, guarda la bienvenida y vuelve a la portada. Devuelve su id. */
async function newAccount(page: Page, nick?: string): Promise<string> {
  const email = await signUp(page, "en");
  if (nick) await page.getByTestId("profile-nick").fill(nick);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  const userId = (await userIdByEmail(email))!;
  created.push(userId);
  return userId;
}

test("sin sesión, /verify lleva a entrar y de vuelta", async ({ page }) => {
  await page.goto("/es/verificar");
  await expect(page).toHaveURL(/\/es\/entrar\?next=%2Fes%2Fverificar$/);
});

test("el aviso de récord pendiente lleva a /verify, que empieza su partida de verificación", async ({ page }) => {
  const userId = await newAccount(page);
  await seedPendingVerification(userId, { wpm: 80 });
  await page.reload();

  const notice = page.getByTestId("verify-notice");
  await expect(notice).toContainText(/Record pending verification · 2[34] h left/);
  await notice.click();
  await expect(page).toHaveURL(/\/en\/verify$/);
  await expect(page.getByTestId("verify-item")).toContainText("you need 68 wpm · 3 attempts");

  await page.getByTestId("verify-start").click();
  await expect(page.getByTestId("verify-countdown")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("verify-canvas")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
  await expect(page.getByTestId("word")).toHaveCount(0);
});

/**
 * Una partida Ranked que entra en el top 10 de hoy: 60 palabras a una tecla cada ~55 ms en 30 s (unas
 * 140 PPM), más que cualquier otra partida de los E2E con cuenta (6 palabras, ~14 PPM; las de esta
 * prueba se borran al acabar). Espera al resultado, en `review`.
 */
async function playRecord(page: Page): Promise<void> {
  const words = await startRanked(page, "en", 60);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 50 });
  await expect(page.getByTestId("rank-summary")).toContainText("Your score would be #", { timeout: 40_000 });
}

/** Pulsa "Verificar ahora" y devuelve las palabras de la partida de verificación: el canvas no las enseña en el DOM. */
async function startVerification(page: Page): Promise<string[]> {
  const started = page.waitForResponse(
    (response) => response.url().endsWith("/api/game/start") && response.request().postDataJSON()?.mode === "verification",
  );
  await page.getByTestId("verify-now").click();
  const { words } = (await (await started).json()) as { words: string[] };
  await expect(page.getByTestId("verify-countdown")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("verify-canvas")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
  await expect(page.getByTestId("word")).toHaveCount(0);
  return words;
}

test("entra en un top 10, se verifica tecleando en el canvas y su marca aparece en el ranking", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
  const nick = `e2e_v${crypto.randomUUID().slice(0, 8)}`;
  await newAccount(page, nick);
  await playRecord(page);

  const words = await startVerification(page);
  const canvas = page.getByTestId("verify-canvas");
  // Nítido: dibuja a la resolución del dispositivo, y cabe en la pantalla.
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    css: element.clientWidth,
    dpr: window.devicePixelRatio,
  }));
  expect(size.width).toBe(Math.round(size.css * size.dpr));
  if (isMobile) {
    expect(size.dpr).toBeGreaterThanOrEqual(2);
    expect(size.css).toBeLessThanOrEqual(360 - 32);
    // Al tocar el texto se enfoca el campo oculto: el que abre el teclado del móvil. La partida ya lo
    // enfoca al empezar (sin el toque del jugador, el móvil no abre el teclado): se le quita antes.
    const input = page.getByTestId("typing-input");
    await input.evaluate((element: HTMLInputElement) => element.blur());
    await expect(input).not.toBeFocused();
    await canvas.tap();
    await expect(input).toBeFocused();
  }

  // Más palabras que en el récord, al mismo ritmo: pasa del 85 % de sus PPM.
  await page.keyboard.type(`${words.slice(0, 70).join(" ")} `, { delay: 50 });
  const result = page.getByTestId("verify-result");
  await expect(result).toContainText("Verified! Your record is now on the ranking.", { timeout: 40_000 });
  await result.getByRole("link", { name: "View ranking" }).click();
  await expect(page.locator(`[data-testid="leaderboard-row"][data-nick="${nick}"]`)).toBeVisible();
});

test("tecleando despacio no se verifica: quedan intentos y la marca no aparece en el ranking", async ({ page }) => {
  const nick = `e2e_v${crypto.randomUUID().slice(0, 8)}`;
  const userId = await newAccount(page, nick);
  await playRecord(page);

  const words = await startVerification(page);
  await page.keyboard.type(`${words.slice(0, 3).join(" ")} `, { delay: 200 });
  await expect(page.getByTestId("verify-result")).toContainText(/You were [\d.]+ wpm short\. You have 2 attempts left\./, {
    timeout: 40_000,
  });
  await expect(page.getByTestId("verify-retry")).toBeVisible();

  expect(await verdictsOf(userId)).toContain("review");
  for (const input of ["physical", "touch"]) {
    await page.goto(`/en/leaderboard/${input}/today`);
    await expect(page.locator(`[data-testid="leaderboard-row"][data-nick="${nick}"]`)).toHaveCount(0);
  }
});
