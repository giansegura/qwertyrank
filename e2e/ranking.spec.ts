import { expect, test } from "@playwright/test";
import {
  closeDb,
  randomClientIp,
  seedVerifiedLevels,
  signUp,
  signUpOnLoginPage,
  userIdByEmail,
  verdictsOf,
} from "./helpers/accounts";
import { switchLocale } from "./helpers/locale";
import { playValidGame } from "./helpers/ranked";

test.describe.configure({ timeout: 120_000 });

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

test("con cuenta: la partida da su posición, aparece en el ranking y en su perfil", async ({ page }) => {
  // Ya verificado: su partida se publica aunque entre en el top 10 (spec 4b §2.1).
  await seedVerifiedLevels(await signUp(page, "en"));
  const nick = `e2e_${crypto.randomUUID().slice(0, 8)}`;
  await page.getByTestId("profile-nick").fill(nick);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  // El ranking ya está en caché (ISR) antes de jugar: así se comprueba que entrar en el top 100 lo revalida.
  for (const input of ["physical", "touch"]) await page.goto(`/en/leaderboard/${input}`);

  await playValidGame(page);
  const summary = page.getByTestId("rank-summary");
  await expect(summary).toContainText(/#\d+ on the leaderboard/);
  await expect(summary).toContainText("New personal best!");

  await summary.getByRole("link", { name: "View ranking" }).click();
  await expect(page).toHaveURL(/\/en\/leaderboard\/(physical|touch)$/);
  const position = page.getByTestId("my-position");
  await expect(position).toContainText(/Your position: #\d+/);
  const rank = Number((await position.textContent())!.match(/#(\d+)/)![1]);
  // Al entrar en el top 100 la página se revalida al momento: el jugador ya sale en la tabla.
  if (rank <= 100) await expect(page.locator(`[data-testid="leaderboard-row"][data-nick="${nick}"]`)).toBeVisible();

  await page.goto(`/en/u/${nick}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nick);
  await expect(page.getByTestId("profile-records").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("profile-history").locator("li")).toHaveCount(1);
});

test("anónimo: «Guárdalo» lleva a crear la cuenta y la partida pasa a ella", async ({ page }) => {
  // En inglés: Playwright escribe las letras con tilde insertando texto sin pulsar teclas, y el
  // anti-trampas (con razón) rechaza esa partida como texto inyectado.
  await playValidGame(page, "en");
  await expect(page.getByTestId("rank-summary")).toContainText(/You'd be #\d+ on the leaderboard/);
  await page.getByTestId("save-game").click();
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fen%2Fsave%2F/);

  const email = await signUpOnLoginPage(page);
  await seedVerifiedLevels(email);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL(/\/en\/save\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("save-result")).toContainText("Game saved to your account.");
  await expect(page.getByTestId("rank-summary")).toContainText(/#\d+ on the leaderboard/);

  const userId = await userIdByEmail(email);
  expect(await verdictsOf(userId!)).toEqual(["valid"]);
});

test("ranking: abre el teclado del dispositivo, solo filtra por teclado y la URL se traduce al cambiar de idioma", async ({
  page,
  isMobile,
}) => {
  await page.goto("/es/ranking");
  await expect(page).toHaveURL(isMobile ? /\/es\/ranking\/tactil$/ : /\/es\/ranking\/fisico$/);
  await expect(page.getByRole("navigation", { name: "Teclado" }).getByRole("link")).toHaveText(["Teclado físico", "Teclado táctil"]);
  await expect(page.getByText("Se reinicia en")).toHaveCount(0);

  await switchLocale(page, "en");
  await expect(page).toHaveURL(isMobile ? /\/en\/leaderboard\/touch$/ : /\/en\/leaderboard\/physical$/);

  await page.goto("/en/ranking/fisico");
  await expect(page).toHaveURL(/\/en\/leaderboard\/physical$/);
});

test("las URLs antiguas con periodo ya no existen", async ({ request }) => {
  for (const path of ["/es/ranking/fisico/hoy", "/en/leaderboard/physical/today", "/pt/ranking/tatil/sempre"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
