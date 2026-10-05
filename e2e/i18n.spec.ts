import { expect, test } from "@playwright/test";

test.describe("navegador en español", () => {
  test.use({ locale: "es-ES" });

  test("/ redirige a /es", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿A qué velocidad escribes?");
    await expect(page.getByTestId("timer")).toHaveText("30");
  });
});

test.describe("navegador en portugués", () => {
  test.use({ locale: "pt-BR" });

  test("/ redirige a /pt", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt$/);
  });
});

test("la práctica tiene ruta traducida en cada idioma", async ({ page }) => {
  await page.goto("/es/practica");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica");
  await page.goto("/pt/pratica");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prática");
});

test("cambiar de idioma conserva la página", async ({ page }) => {
  await page.goto("/en/practice");
  await page.getByRole("link", { name: "es", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/practica$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica");
});

test("el texto inicial de la práctica está en el idioma de la página", async ({ page }) => {
  await page.goto("/es/practica");
  const words = await page.getByTestId("word").evaluateAll((els) => els.map((el) => el.getAttribute("data-word")));
  expect(words).toHaveLength(160);
  expect(words.some((word) => /[áéíóúñ]/.test(word ?? ""))).toBe(true);
});

test("el idioma elegido se recuerda aunque se cierre el navegador", async ({ page, context }) => {
  await page.goto("/en/practice");
  await page.getByRole("link", { name: "es", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/practica$/);
  const cookie = (await context.cookies()).find((c) => c.name === "NEXT_LOCALE");
  expect(cookie?.value).toBe("es");
  // Una cookie de sesión tiene expires = -1: se perdería al cerrar el navegador.
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
});
