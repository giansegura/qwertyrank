import { expect, test } from "@playwright/test";
import { switchLocale } from "./helpers/locale";

test.describe("browser in Spanish", () => {
  test.use({ locale: "es-ES" });

  test("/ redirects to /es", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿A qué velocidad escribes?");
    await expect(page.getByTestId("timer")).toHaveText("30");
  });
});

test.describe("browser in Portuguese", () => {
  test.use({ locale: "pt-BR" });

  test("/ redirects to /pt", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt$/);
  });
});

test("practice has a translated route in each language", async ({ page }) => {
  await page.goto("/es/practica");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica");
  await page.goto("/pt/pratica");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prática");
});

test("switching language keeps the page", async ({ page }) => {
  await page.goto("/en/practice");
  await switchLocale(page, "es");
  await expect(page).toHaveURL(/\/es\/practica$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica");
});

test("the initial practice text is in the page's language", async ({ page }) => {
  await page.goto("/es/practica");
  const words = await page.getByTestId("word").evaluateAll((els) => els.map((el) => el.getAttribute("data-word")));
  expect(words).toHaveLength(160);
  expect(words.some((word) => /[áéíóúñ]/.test(word ?? ""))).toBe(true);
});

test("the chosen language is remembered even after closing the browser", async ({ page, context }) => {
  await page.goto("/en/practice");
  await switchLocale(page, "es");
  await expect(page).toHaveURL(/\/es\/practica$/);
  const cookie = (await context.cookies()).find((c) => c.name === "NEXT_LOCALE");
  expect(cookie?.value).toBe("es");
  // A session cookie has expires = -1: it would be lost when closing the browser.
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
});
