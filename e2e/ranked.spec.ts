import { expect, test } from "@playwright/test";
import { startRanked } from "./helpers/ranked";

test.describe.configure({ timeout: 90_000 });

test("el texto de Ranked no viene en el HTML: lo envía el servidor al empezar", async ({ page }) => {
  const html = await (await page.request.get("/en")).text();
  expect(html).not.toContain('data-testid="word"');
  await page.goto("/en");
  await expect(page.getByTestId("ranked-start")).toBeVisible();
  await expect(page.getByTestId("word")).toHaveCount(0);
});

test("partida Ranked completa: cuenta atrás, 30 s y veredicto válido del servidor", async ({ page }) => {
  const words = await startRanked(page);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 120 });
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ranked-status")).toHaveText("Valid game");
  expect(Number(await page.getByTestId("result-wpm").textContent())).toBeGreaterThan(0);
});

test("texto inyectado por código: la partida no es válida", async ({ page }) => {
  const words = await startRanked(page);
  await page.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="typing-input"]')!;
    for (const char of text) {
      input.value += char;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
    }
  }, `${words.join(" ")} `);
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ranked-status")).toHaveText(/Unrecognized activity/);
});

test("si el reto de Cloudflare no carga, lo dice y ofrece la práctica", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
  await page.goto("/en");
  await page.getByTestId("ranked-start").click();
  await expect(page.getByTestId("ranked-blocked")).toContainText("We couldn't check that you're human");
  await expect(page.getByRole("link", { name: "Go to practice" })).toBeVisible();
});
