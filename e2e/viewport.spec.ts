import { expect, test } from "@playwright/test";

// The initial screen fits without scrolling on the tightest laptop (1280×720, the desktop project's
// viewport) and on a small phone (360×640). If anything is wider than the screen, the mobile
// browser zooms out the whole page: that's why the width is checked too.
// The home page continues with the top 10 and the explanatory text (spec 5b §7): there it's enough
// for the test to fit entirely on the first screen.
for (const path of ["/en", "/en/practice", "/es/practica", "/pt/pratica"]) {
  test(`${path} fits on the screen without scrolling`, async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 640 });
    const viewport = page.viewportSize()!;
    await page.goto(path);

    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(size.width).toBe(viewport.width);
    if (path === "/en") {
      const area = (await page.getByTestId("typing-area").boundingBox())!;
      expect(area.y + area.height).toBeLessThanOrEqual(viewport.height);
    } else {
      expect(size.height).toBe(viewport.height);
    }
    // A single line: logo, Practice, Ranking, language and account fit at 360 px.
    expect((await page.locator("header").boundingBox())!.height).toBeLessThanOrEqual(60);
  });
}
