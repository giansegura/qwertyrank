import { expect, test, type Page } from "@playwright/test";
import { closeDb, randomClientIp, seedRankedPlayer, setRole, setStatus, signUp } from "./helpers/accounts";

test.describe.configure({ timeout: 120_000 });

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

/** Crea una cuenta en inglés, guarda la bienvenida (con `nick` si se da) y vuelve a la portada. */
async function newAccount(page: Page, nick?: string): Promise<string> {
  const email = await signUp(page, "en");
  if (nick) await page.getByTestId("profile-nick").fill(nick);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  return email;
}

test("un jugador baneado no puede empezar una partida Ranked", async ({ page }) => {
  const email = await newAccount(page);
  await setStatus(email, "banned");
  await page.getByTestId("ranked-start").click();
  await expect(page.getByTestId("ranked-blocked")).toContainText("Your account can't play ranked games.");
});

test("sin rol de admin, /admin no existe", async ({ page }) => {
  expect((await page.request.get("/admin")).status()).toBe(404);
  await newAccount(page);
  expect((await page.request.get("/admin")).status()).toBe(404);
  expect((await page.request.get("/admin/players")).status()).toBe(404);
});

test("una denuncia llega a la cola y el admin banea desde la ficha", async ({ page }) => {
  const target = `e2e_t${crypto.randomUUID().slice(0, 8)}`;
  await seedRankedPlayer(target);
  const email = await newAccount(page);
  await setRole(email, "admin");

  const row = page.locator(`[data-testid="leaderboard-row"][data-nick="${target}"]`);
  await page.goto("/en/leaderboard/physical/all-time");
  await expect(row).toBeVisible();

  await page.goto(`/en/u/${target}`);
  expect((await page.request.get(`/en/u/${target}`)).status()).toBe(200);
  await page.getByTestId("report-open").click();
  await page.getByLabel("Cheating").check();
  await page.getByTestId("report-send").click();
  await expect(page.getByTestId("report-sent")).toBeVisible();

  await page.goto("/admin");
  await page.locator(`[data-testid="admin-report-row"][data-nick="${target}"]`).getByRole("link").click();
  await expect(page.getByTestId("admin-player-nick")).toHaveText(target);
  await page.getByTestId("admin-reason").fill("Bot: 250 ppm sin un error");
  await page.getByTestId("admin-set-banned").click();
  await expect(page.getByTestId("admin-notice")).toHaveText("Jugador baneado.");

  await page.goto("/en/leaderboard/physical/all-time");
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/en/u/${target}`)).status()).toBe(404);
});

test("en shadow-ban ve su propio perfil; los demás reciben 404", async ({ page, browser, baseURL }) => {
  const nick = `e2e_s${crypto.randomUUID().slice(0, 8)}`;
  const email = await newAccount(page, nick);
  await setStatus(email, "shadowbanned");

  await page.goto(`/en/u/${nick}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nick);

  const stranger = await browser.newPage({ baseURL });
  const response = await stranger.goto(`/en/u/${nick}`);
  expect(response?.status()).toBe(404);
  await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("Player not found");
  await stranger.close();
});

test("las URLs imposibles responden 404", async ({ request }) => {
  for (const path of ["/en/u/a", "/en/u/con%20espacio", "/es/leaderboard/nada/today"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
