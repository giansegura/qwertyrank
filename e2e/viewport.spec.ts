import { expect, test } from "@playwright/test";

// La pantalla inicial cabe sin scroll en el portátil más justo (1280×720, el viewport del
// proyecto desktop) y en un móvil pequeño (360×640). Si algo es más ancho que la pantalla,
// el navegador móvil aleja el zoom de toda la página: por eso también se comprueba el ancho.
for (const path of ["/en", "/en/practice", "/es/practica", "/pt/pratica"]) {
  test(`${path} cabe en la pantalla sin scroll`, async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 360, height: 640 });
    const viewport = page.viewportSize()!;
    await page.goto(path);

    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(size).toEqual({ width: viewport.width, height: viewport.height });
    // Una sola línea: logo, Práctica, Ranking, idioma y cuenta caben a 360 px.
    expect((await page.locator("header").boundingBox())!.height).toBeLessThanOrEqual(60);
  });
}
