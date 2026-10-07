import { expect, test, type Page } from "@playwright/test";
import { closeDb, deleteAccount, randomClientIp, seedPendingVerification, signUp, userIdByEmail } from "./helpers/accounts";

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
