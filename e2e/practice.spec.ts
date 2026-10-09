import { expect, test } from "@playwright/test";

test("a practice game ends with a result and Tab restarts", async ({ page }) => {
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

test("mistakes are marked and show up in the result", async ({ page }) => {
  await page.goto("/en/practice");
  const first = await page.getByTestId("word").first().getAttribute("data-word");
  await page.getByTestId("typing-area").click();
  await page.keyboard.type("q".repeat(first!.length) + " ", { delay: 20 });
  await expect(page.getByTestId("word").first()).toHaveAttribute("data-state", "done");

  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-accuracy")).toHaveText("0%");
  await expect(page.getByTestId("result-mistakes")).toBeVisible();
});

test("on desktop you can type right after loading, without a focus prompt", async ({ page, isMobile }) => {
  test.skip(isMobile, "on mobile you have to tap the text to open the keyboard");
  await page.goto("/en/practice");
  await expect(page.getByTestId("focus-prompt")).toBeHidden();
  const first = await page.getByTestId("word").first().getAttribute("data-word");
  await page.keyboard.type(first!.slice(0, 2));
  await expect(page.getByTestId("word").first().locator('[data-status="correct"]')).toHaveCount(2);
});

test("on mobile you are asked to tap the text before starting", async ({ page, isMobile }) => {
  test.skip(!isMobile, "on desktop the input focuses itself");
  await page.goto("/en/practice");
  await expect(page.getByTestId("focus-prompt")).toBeVisible();
  await page.getByTestId("typing-area").click();
  await expect(page.getByTestId("focus-prompt")).toBeHidden();
});
