import { expect, type Page } from "@playwright/test";

/** Abre la portada, pulsa Empezar y espera a que acabe la cuenta atrás. Devuelve las primeras palabras. */
export async function startRanked(page: Page): Promise<string[]> {
  await page.goto("/en");
  await page.getByTestId("ranked-start").click();
  await expect(page.getByTestId("countdown")).toBeVisible();
  await expect(page.getByTestId("word").first()).toBeVisible({ timeout: 5_000 });
  return page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 6).map((el) => el.getAttribute("data-word") ?? ""));
}
