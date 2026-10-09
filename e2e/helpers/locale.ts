import type { Page } from "@playwright/test";

/** Switches language from the header. On mobile it is a dropdown: it has to be opened first. */
export async function switchLocale(page: Page, code: string): Promise<void> {
  const menu = page.getByTestId("locale-menu");
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: code, exact: true }).click();
}
