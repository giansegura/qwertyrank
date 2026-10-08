import { expect, test } from "@playwright/test";

test("durante la beta nada se indexa: cabecera X-Robots-Tag, meta robots y HSTS", async ({ page }) => {
  const response = await page.goto("/es");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex");
  expect(response?.headers()["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("robots.txt no bloquea nada: si bloqueara, los buscadores no verían el noindex", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toMatch(/disallow/i);
});
