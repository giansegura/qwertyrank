import { expect, type Page, test } from "@playwright/test";
import { switchLocale } from "./helpers/locale";

const SITE = "https://qwertyrank.com";

async function jsonLdTypes(page: Page): Promise<unknown[]> {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts.map((text) => (JSON.parse(text) as { "@type"?: unknown })["@type"]);
}

for (const [locale, path] of [
  ["en", "/en/guides"],
  ["es", "/es/guias"],
  ["pt", "/pt/guias"],
] as const) {
  test(`the guides index in ${locale} lists the five guides`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId("guides-index").getByRole("listitem")).toHaveCount(5);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}${path}`);
  });
}

test("a guide has its title, body, metadata, Article JSON-LD and call to action", async ({ page }) => {
  await page.goto("/es/guias/ppm-y-cpm");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PPM y CPM: cómo se mide la velocidad de escritura");
  await expect(page.getByTestId("guide-body").getByRole("heading", { level: 2 }).first()).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/es/guias/ppm-y-cpm`);
  await expect(page.locator('link[rel="alternate"][hreflang="pt"]')).toHaveAttribute("href", `${SITE}/pt/guias/ppm-e-cpm`);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", `${SITE}/en/guides/wpm-vs-cpm`);
  expect(await jsonLdTypes(page)).toEqual(["Article", "BreadcrumbList"]);
  await expect(page.getByTestId("guide-cta").getByRole("link").first()).toHaveAttribute("href", "/es");
});

test("switching locale on a guide lands on that locale's slug", async ({ page }) => {
  await page.goto("/es/guias/ppm-y-cpm");
  await switchLocale(page, "pt");
  await expect(page).toHaveURL(/\/pt\/guias\/ppm-e-cpm$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PPM e CPM: como se mede a velocidade de digitação");
});

test("another locale's slug redirects to this locale's, and an unknown guide is a 404", async ({ page }) => {
  await page.goto("/es/guides/wpm-vs-cpm");
  await expect(page).toHaveURL(/\/es\/guias\/ppm-y-cpm$/);
  await page.goto("/en/guias/ppm-y-cpm");
  await expect(page).toHaveURL(/\/en\/guides\/wpm-vs-cpm$/);
  expect((await page.goto("/en/guides/nope"))?.status()).toBe(404);
});

test("the footer links to the guides index", async ({ page }) => {
  await page.goto("/en");
  await page.getByTestId("site-footer").getByRole("link", { name: "Guides" }).click();
  await expect(page).toHaveURL(/\/en\/guides$/);
});
