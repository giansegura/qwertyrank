import { expect, type Page } from "@playwright/test";

/** Opens the home page, clicks Start and waits for the countdown to end. Returns the first `count` words. */
export async function startRanked(page: Page, locale: "en" | "es" | "pt" = "en", count = 6): Promise<string[]> {
  await page.goto(`/${locale}`);
  await page.getByTestId("ranked-start").click();
  // Turnstile adds a round trip before the countdown starts.
  await expect(page.getByTestId("countdown")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("word").first()).toBeVisible({ timeout: 5_000 });
  return page
    .getByTestId("word")
    .evaluateAll((elements, n) => elements.slice(0, n).map((el) => el.getAttribute("data-word") ?? ""), count);
}

/** A valid Ranked game: the first words, typed correctly. Waits for the result. */
export async function playValidGame(page: Page, locale: "en" | "es" | "pt" = "en"): Promise<void> {
  const words = await startRanked(page, locale);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 120 });
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
}
