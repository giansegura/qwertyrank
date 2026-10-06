import type { Page } from "@playwright/test";

/** Cambia de idioma desde la cabecera. En móvil es un desplegable: primero hay que abrirlo. */
export async function switchLocale(page: Page, code: string): Promise<void> {
  const menu = page.getByTestId("locale-menu");
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: code, exact: true }).click();
}
