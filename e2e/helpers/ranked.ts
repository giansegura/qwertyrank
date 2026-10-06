import { expect, type Page } from "@playwright/test";

/** Abre la portada, pulsa Empezar y espera a que acabe la cuenta atrás. Devuelve las primeras palabras. */
export async function startRanked(page: Page, locale: "en" | "es" | "pt" = "en"): Promise<string[]> {
  await page.goto(`/${locale}`);
  await page.getByTestId("ranked-start").click();
  await expect(page.getByTestId("countdown")).toBeVisible();
  await expect(page.getByTestId("word").first()).toBeVisible({ timeout: 5_000 });
  return page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 6).map((el) => el.getAttribute("data-word") ?? ""));
}

/** Una partida Ranked válida: las primeras palabras, bien escritas. Espera al resultado. */
export async function playValidGame(page: Page, locale: "en" | "es" | "pt" = "en"): Promise<void> {
  const words = await startRanked(page, locale);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 120 });
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
}
