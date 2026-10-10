import { expect, type Page, test } from "@playwright/test";
import { closeDb, seedGame, seedPendingVerification, setStatus, signUp, userIdByEmail } from "./helpers/accounts";
import { playValidGame } from "./helpers/ranked";

const SITE = "https://qwertyrank.com";

/** A meta's `content`, by `name` or `property`. */
async function meta(page: Page, key: string): Promise<string | null> {
  return page.locator(`meta[name="${key}"], meta[property="${key}"]`).first().getAttribute("content");
}

test.afterAll(closeDb);

test("after a valid game \"Share\" shows up and its page shows the result", async ({ page }) => {
  // In English: Playwright types accented letters without key events and Ranked would reject the game.
  await playValidGame(page, "en");
  await expect(page.getByTestId("share-button")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "View result" }).click();
  await expect(page).toHaveURL(/\/en\/r\/[0-9a-f-]{36}$/);
  const result = page.getByTestId("game-result");
  await expect(result).toContainText("wpm");
  await expect(result).toContainText("Anonymous");
  // The test in the game's language.
  await expect(page.getByRole("link", { name: "Take the test" })).toHaveAttribute("href", "/en");
});

test("the page is not indexed and its image is the game's", async ({ page, request }) => {
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

test("with an account, the nick links to the profile", async ({ page, browser }) => {
  const email = await signUp(page, "es");
  const id = await seedGame((await userIdByEmail(email))!);
  const visitor = await browser.newPage();
  await visitor.goto(`/es/r/${id}`);
  await expect(visitor.getByTestId("game-result").locator('a[href^="/es/u/"]')).toBeVisible();
  await expect(visitor.getByTestId("game-result")).not.toContainText("Anónimo");
  await visitor.close();
});

test("a made-up id is a 404, and so is its image", async ({ page, request }) => {
  const id = crypto.randomUUID();
  expect((await page.goto(`/es/r/${id}`))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Resultado no encontrado" })).toBeVisible();
  expect((await request.get(`/es/r/${id}/opengraph-image`)).status()).toBe(404);
  expect((await page.goto("/es/r/hola"))?.status()).toBe(404);
});

test("under shadow ban: 404 for everyone else and their game for them", async ({ page, browser }) => {
  const email = await signUp(page, "es");
  const id = await seedGame((await userIdByEmail(email))!);
  await setStatus(email, "shadowbanned");

  const stranger = await browser.newPage();
  expect((await stranger.goto(`/es/r/${id}`))?.status()).toBe(404);
  await expect(stranger.getByRole("heading", { name: "Resultado no encontrado" })).toBeVisible();
  await stranger.close();

  // The 404 asks from the browser and shows them their own (spec 5d §5).
  await page.goto(`/es/r/${id}`);
  await expect(page.getByTestId("game-result")).toContainText("72");
});

test("a game waiting for its verification says so, without its score or nick", async ({ page, browser }) => {
  const email = await signUp(page, "es");
  const { gameId } = await seedPendingVerification((await userIdByEmail(email))!, { wpm: 80 });
  const stranger = await browser.newPage();
  expect((await stranger.goto(`/es/r/${gameId}`))?.status()).toBe(200);
  await expect(stranger.getByRole("heading", { name: "Resultado pendiente de verificación" })).toBeVisible();
  await expect(stranger.getByTestId("pending-result")).not.toContainText("80");
  expect(await meta(stranger, "robots")).toContain("noindex");
  await stranger.close();
});
