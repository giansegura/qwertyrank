import { expect, test, type Page } from "@playwright/test";

type ShiftWindow = Window & { __cls: number };

/** Suma los desplazamientos de layout que no siguen a una acción del usuario (CLS). */
async function trackLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as ShiftWindow).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) (window as unknown as ShiftWindow).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

const layoutShift = (page: Page) => page.evaluate(() => (window as unknown as ShiftWindow).__cls);

test("el resultado no desplaza el contenido de la página (CLS)", async ({ page }) => {
  await trackLayoutShifts(page);

  await page.goto("/en/practice");
  const area = page.getByTestId("typing-area");
  const areaTop = async () => (await area.boundingBox())!.y;
  const before = await areaTop();

  // Peor caso: varias palabras mal escritas llenan la lista de teclas falladas.
  const words = await page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 4).map((el) => el.getAttribute("data-word") ?? ""));
  await area.click();
  await page.keyboard.type(words.map((word) => "q".repeat(word.length)).join(" ") + " ");
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });

  expect(await areaTop()).toBe(before);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});

test("la cabecera no se mueve cuando llega la sesión (CLS)", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 640 });
  await trackLayoutShifts(page);
  // Sesión simulada y con algo de latencia, como en la red real: lo que importa es el hueco
  // de la cabecera, no quién es el jugador.
  await page.route("**/api/auth/get-session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ json: { session: { id: "s" }, user: { nick: "gian_42" } } });
  });

  await page.goto("/en/practice");
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: gian_42");
  await page.waitForTimeout(500);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});

test("el ranking no se mueve cuando llegan tu posición y la cuenta atrás (CLS)", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
  await trackLayoutShifts(page);
  // Sin sesión y con algo de latencia, como un visitante anónimo en la red real.
  await page.route("**/api/auth/get-session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ json: null });
  });

  await page.goto("/en/leaderboard/physical/today");
  await expect(page.getByTestId("my-position")).toContainText("Sign in to appear in the ranking");
  await page.waitForTimeout(500);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});
