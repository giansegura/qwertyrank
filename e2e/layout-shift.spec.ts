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

/** Sesión simulada: lo que importa es el aviso bajo el menú, no quién es el jugador. */
async function fakeSession(page: Page) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { session: { id: "s" }, user: { nick: "gian_42" } } }),
  );
}

test("el aviso de récord pendiente no mueve la cabecera ni la página (CLS)", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 640 });
  await trackLayoutShifts(page);
  await fakeSession(page);
  await page.route("**/api/verification", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const expiresAt = new Date(Date.now() + 5 * 3_600_000).toISOString();
    await route.fulfill({
      json: {
        pending: [
          { id: "v1", language: "en", inputType: "physical", targetWpm: 100, requiredWpm: 85, attemptsLeft: 3, expiresAt },
        ],
      },
    });
  });

  await page.goto("/en/practice");
  await expect(page.getByTestId("verify-notice")).toContainText("Record pending verification");
  await page.waitForTimeout(500);
  expect(await layoutShift(page)).toBeLessThan(0.001);
  expect((await page.locator("header").boundingBox())!.height).toBeLessThanOrEqual(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test("si GET /api/verification falla, ni aviso ni salto en la cabecera", async ({ page }) => {
  await trackLayoutShifts(page);
  await fakeSession(page);
  let asked = false;
  await page.route("**/api/verification", async (route) => {
    asked = true;
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });

  await page.goto("/en/practice");
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: gian_42");
  await expect.poll(() => asked).toBe(true);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("verify-notice")).toHaveCount(0);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});
