import { expect, type Page, test } from "@playwright/test";
import { closeDb, seedGame, setStatus, signUp, userIdByEmail } from "./helpers/accounts";
import { playValidGame } from "./helpers/ranked";

const SITE = "https://qwertyrank.com";

/** El `content` de una meta, por `name` o `property`. */
async function meta(page: Page, key: string): Promise<string | null> {
  return page.locator(`meta[name="${key}"], meta[property="${key}"]`).first().getAttribute("content");
}

test.afterAll(closeDb);

test("tras una partida válida sale «Compartir» y su página enseña el resultado", async ({ page }) => {
  // En inglés: Playwright escribe las letras con tilde sin eventos de tecla y Ranked rechazaría la partida.
  await playValidGame(page, "en");
  await expect(page.getByTestId("share-button")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "View result" }).click();
  await expect(page).toHaveURL(/\/en\/r\/[0-9a-f-]{36}$/);
  const result = page.getByTestId("game-result");
  await expect(result).toContainText("wpm");
  await expect(result).toContainText("Anonymous");
  // El test del idioma de la partida.
  await expect(page.getByRole("link", { name: "Take the test" })).toHaveAttribute("href", "/en");
});

test("la página no se indexa y su imagen es la de la partida", async ({ page, request }) => {
  const id = await seedGame(null);
  await page.goto(`/es/r/${id}`);
  await expect(page).toHaveTitle("72 ppm en español · QwertyRank");
  expect(await meta(page, "robots")).toContain("noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  const image = await meta(page, "og:image");
  expect(image).toMatch(new RegExp(`^${SITE}/es/r/${id}/opengraph-image`));
  const { pathname, search } = new URL(image!);
  const response = await request.get(pathname + search);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("con cuenta, el nick enlaza a su perfil", async ({ page, browser }) => {
  const email = await signUp(page, "es");
  const id = await seedGame((await userIdByEmail(email))!);
  const visitor = await browser.newPage();
  await visitor.goto(`/es/r/${id}`);
  await expect(visitor.getByTestId("game-result").locator('a[href^="/es/u/"]')).toBeVisible();
  await expect(visitor.getByTestId("game-result")).not.toContainText("Anónimo");
  await visitor.close();
});

test("un id inventado es una 404, también su imagen", async ({ page, request }) => {
  const id = crypto.randomUUID();
  expect((await page.goto(`/es/r/${id}`))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Resultado no encontrado" })).toBeVisible();
  expect((await request.get(`/es/r/${id}/opengraph-image`)).status()).toBe(404);
  expect((await page.goto("/es/r/hola"))?.status()).toBe(404);
});

test("en shadow-ban: 404 para los demás y su partida para él", async ({ page, browser }) => {
  const email = await signUp(page, "es");
  const id = await seedGame((await userIdByEmail(email))!);
  await setStatus(email, "shadowbanned");

  const stranger = await browser.newPage();
  expect((await stranger.goto(`/es/r/${id}`))?.status()).toBe(404);
  await expect(stranger.getByRole("heading", { name: "Resultado no encontrado" })).toBeVisible();
  await stranger.close();

  // La 404 pregunta en el navegador y le enseña la suya (spec 5d §5).
  await page.goto(`/es/r/${id}`);
  await expect(page.getByTestId("game-result")).toContainText("72");
});
