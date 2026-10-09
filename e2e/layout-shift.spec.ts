import { expect, test, type Page } from "@playwright/test";

type ShiftWindow = Window & { __cls: number };

/** Sums the layout shifts that don't follow a user action (CLS). */
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

test("the result doesn't shift the page content (CLS)", async ({ page }) => {
  await trackLayoutShifts(page);

  await page.goto("/en/practice");
  const area = page.getByTestId("typing-area");
  const areaTop = async () => (await area.boundingBox())!.y;
  const before = await areaTop();

  // Worst case: several mistyped words fill the list of missed keys.
  const words = await page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 4).map((el) => el.getAttribute("data-word") ?? ""));
  await area.click();
  await page.keyboard.type(words.map((word) => "q".repeat(word.length)).join(" ") + " ");
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });

  expect(await areaTop()).toBe(before);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});

test("the header doesn't move when the session arrives (CLS)", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 640 });
  await trackLayoutShifts(page);
  // Fake session with some latency, as on the real network: what matters is the header's slot,
  // not who the player is.
  await page.route("**/api/auth/get-session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ json: { session: { id: "s" }, user: { nick: "gian_42" } } });
  });

  await page.goto("/en/practice");
  await expect(page.getByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: gian_42");
  await page.waitForTimeout(500);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});

test("the leaderboard doesn't move when your position arrives (CLS)", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 780 });
  await trackLayoutShifts(page);
  // No session and some latency, like an anonymous visitor on the real network.
  await page.route("**/api/auth/get-session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({ json: null });
  });

  await page.goto("/en/leaderboard/physical");
  await expect(page.getByTestId("my-position")).toContainText("Sign in to appear in the ranking");
  await page.waitForTimeout(500);
  expect(await layoutShift(page)).toBeLessThan(0.001);
});

/** Fake session: what matters is the notice under the menu, not who the player is. */
async function fakeSession(page: Page) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { session: { id: "s" }, user: { nick: "gian_42" } } }),
  );
}

test("the pending record notice moves neither the header nor the page (CLS)", async ({ page }, testInfo) => {
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

test("if GET /api/verification fails, no notice and no jump in the header", async ({ page }) => {
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
