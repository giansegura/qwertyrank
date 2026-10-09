import { expect, test } from "@playwright/test";
import { startRanked } from "./helpers/ranked";

test.describe.configure({ timeout: 90_000 });

test("the Ranked text is not in the HTML: the server sends it on start", async ({ page }) => {
  const html = await (await page.request.get("/en")).text();
  expect(html).not.toContain('data-testid="word"');
  await page.goto("/en");
  await expect(page.getByTestId("ranked-start")).toBeVisible();
  await expect(page.getByTestId("word")).toHaveCount(0);
});

test("full Ranked game: countdown, 30 s and a valid verdict from the server", async ({ page }) => {
  const words = await startRanked(page);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 120 });
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ranked-status")).toHaveText("Valid game");
  expect(Number(await page.getByTestId("result-wpm").textContent())).toBeGreaterThan(0);
});

test("text injected by code: the game is not valid", async ({ page }) => {
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

test("if the Cloudflare challenge doesn't load, it says so and offers practice", async ({ page }) => {
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());
  await page.goto("/en");
  await page.getByTestId("ranked-start").click();
  await expect(page.getByTestId("ranked-blocked")).toContainText("We couldn't check that you're human");
  await expect(page.getByRole("link", { name: "Go to practice" })).toBeVisible();
});
