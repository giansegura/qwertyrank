import { expect, test } from "@playwright/test";

test("una partida de práctica termina con resultado y Tab reinicia", async ({ page }) => {
  await page.goto("/en/practice");
  await expect(page.getByTestId("timer")).toHaveText("15");

  const words = await page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 8).map((el) => el.getAttribute("data-word")));
  await page.getByTestId("typing-area").click();
  await page.keyboard.type(`${words.join(" ")} `, { delay: 20 });

  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-accuracy")).toHaveText("100%");
  expect(Number(await page.getByTestId("result-wpm").textContent())).toBeGreaterThan(0);

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("result")).toBeHidden();
  await expect(page.getByTestId("timer")).toHaveText("15");
});

test("los errores se marcan y aparecen en el resultado", async ({ page }) => {
  await page.goto("/en/practice");
  const first = await page.getByTestId("word").first().getAttribute("data-word");
  await page.getByTestId("typing-area").click();
  await page.keyboard.type("q".repeat(first!.length) + " ", { delay: 20 });
  await expect(page.getByTestId("word").first()).toHaveAttribute("data-state", "done");

  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-accuracy")).toHaveText("0%");
  await expect(page.getByTestId("result-mistakes")).toBeVisible();
});

test("en escritorio se puede escribir nada más cargar, sin aviso de foco", async ({ page, isMobile }) => {
  test.skip(isMobile, "en móvil hay que tocar el texto para que se abra el teclado");
  await page.goto("/en/practice");
  await expect(page.getByTestId("focus-prompt")).toBeHidden();
  const first = await page.getByTestId("word").first().getAttribute("data-word");
  await page.keyboard.type(first!.slice(0, 2));
  await expect(page.getByTestId("word").first().locator('[data-status="correct"]')).toHaveCount(2);
});

test("en móvil se pide tocar el texto antes de empezar", async ({ page, isMobile }) => {
  test.skip(!isMobile, "en escritorio el input se enfoca solo");
  await page.goto("/en/practice");
  await expect(page.getByTestId("focus-prompt")).toBeVisible();
  await page.getByTestId("typing-area").click();
  await expect(page.getByTestId("focus-prompt")).toBeHidden();
});
