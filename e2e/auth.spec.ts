import { expect, test } from "@playwright/test";
import { closeDb, randomClientIp, seedVerifiedLevels, signUp, userIdByEmail, verdictsOf } from "./helpers/accounts";
import { playValidGame } from "./helpers/ranked";

test.describe.configure({ timeout: 90_000 });

// Compare the path, not the whole URL: the welcome one (`…/ajustes?welcome=1&next=/es`) also ends in "/es".
const atHome = (url: URL) => url.pathname === "/es";

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

test("sign-up with an email link: suggested nick, welcome and nick change", async ({ page }) => {
  await signUp(page, "es");
  await expect(page).toHaveURL(/\/es\/ajustes\?welcome=1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¡Te damos la bienvenida a QwertyRank!");
  // e2e1a2b3c4d@example.com → the first word of the email + two digits.
  await expect(page.getByTestId("profile-nick")).toHaveValue(/^e2e[0-9a-f]{8}_\d{2}$/);

  const nick = `e2e_${crypto.randomUUID().slice(0, 8)}`;
  await page.getByTestId("profile-nick").fill(nick);
  await page.getByTestId("profile-country").selectOption("ES");
  await page.getByTestId("profile-save").click();

  await expect(page).toHaveURL(atHome);
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", `Tu cuenta: ${nick}`);
});

test("a signed-in Ranked game is saved under the player's name", async ({ page }) => {
  const email = await signUp(page, "en");
  await seedVerifiedLevels(email);
  await playValidGame(page);
  await expect(page.getByTestId("ranked-status")).toHaveText("Valid game");

  const userId = await userIdByEmail(email);
  expect(await verdictsOf(userId!)).toEqual(["valid"]);
});

test("passkey: added in settings and usable to sign in", async ({ page, context }) => {
  await context.credentials.install();
  await signUp(page, "es");
  await page.goto("/es/ajustes");
  await page.getByTestId("passkey-add").click();
  await expect(page.getByTestId("passkey-item")).toHaveCount(1);

  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(atHome);
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", "Entrar");

  await page.goto("/es/entrar");
  await page.getByTestId("login-passkey").click();
  await expect(page).toHaveURL(atHome);
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", /^Tu cuenta: /);
});

test("deleting the account: back to anonymous and the user is gone", async ({ page }) => {
  const email = await signUp(page, "es");
  await page.goto("/es/ajustes");
  await page.getByTestId("delete-account").click();
  await page.getByTestId("delete-confirm").click();

  await expect(page).toHaveURL(atHome);
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", "Entrar");
  expect(await userIdByEmail(email)).toBeNull();
});

test("a disposable email gets no link", async ({ page }) => {
  await page.goto("/es/entrar");
  await page.getByTestId("login-email").fill("alguien@mailinator.com");
  await page.getByTestId("login-send").click();
  await expect(page.getByTestId("login-error")).toHaveText("No se admiten emails temporales. Usa tu email habitual.");
});

test("settings without a session lead to sign-in and come back afterwards", async ({ page }) => {
  await page.goto("/es/ajustes");
  await expect(page).toHaveURL(/\/es\/entrar\?next=%2Fes%2Fajustes$/);
});
