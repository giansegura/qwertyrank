import { expect, test } from "@playwright/test";

type ShiftWindow = Window & { __cls: number };

test("el resultado no desplaza el contenido de la página (CLS)", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as ShiftWindow).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) (window as unknown as ShiftWindow).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

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
  const cls = await page.evaluate(() => (window as unknown as ShiftWindow).__cls);
  expect(cls).toBeLessThan(0.001);
});
