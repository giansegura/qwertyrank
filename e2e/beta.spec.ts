import { expect, test } from "@playwright/test";

test("during the beta nothing is indexed: X-Robots-Tag header, robots meta and HSTS", async ({ page }) => {
  const response = await page.goto("/es");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex");
  expect(response?.headers()["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("robots.txt blocks nothing: if it did, search engines would not see the noindex", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toMatch(/disallow/i);
});

const LEGAL = [
  { locale: "en", privacy: "/en/privacy", terms: "/en/terms", privacyTitle: "Privacy policy", termsTitle: "Terms of use" },
  { locale: "es", privacy: "/es/privacidad", terms: "/es/terminos", privacyTitle: "Política de privacidad", termsTitle: "Términos de uso" },
  { locale: "pt", privacy: "/pt/privacidade", terms: "/pt/termos", privacyTitle: "Política de privacidade", termsTitle: "Termos de uso" },
] as const;

for (const { locale, privacy, terms, privacyTitle, termsTitle } of LEGAL) {
  test(`the footer links to the privacy policy and the terms (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.getByTestId("site-footer").locator(`a[href="${privacy}"]`).click();
    await expect(page).toHaveURL((url) => url.pathname === privacy);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(privacyTitle);

    await page.getByTestId("site-footer").locator(`a[href="${terms}"]`).click();
    await expect(page).toHaveURL((url) => url.pathname === terms);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(termsTitle);
  });
}

test("the beta and feedback links open an email; the footer is visible without scrolling", async ({ page, isMobile }) => {
  // On a short page: the home page no longer fits on one screen (top 10 and text, spec 5b §7).
  await page.goto("/es/entrar");
  const footer = page.getByTestId("site-footer");
  await expect(footer).toBeInViewport();
  await expect(footer.getByRole("link", { name: "Beta: envíanos tus comentarios", exact: true })).toHaveAttribute("href", "mailto:feedback@qwertyrank.com");
  await expect(footer.getByRole("link", { name: "Envíanos tus comentarios", exact: true })).toHaveAttribute(
    "href",
    "mailto:feedback@qwertyrank.com",
  );
  // The header badge, desktop only: on a phone it would wrap the header line.
  await expect(page.getByTestId("beta-badge")).toBeVisible({ visible: !isMobile });
});

test("on sign-in, the notice links to the terms and the privacy policy", async ({ page }) => {
  await page.goto("/es/entrar");
  const consent = page.getByTestId("login-consent");
  await expect(consent).toContainText("Al crear una cuenta aceptas los Términos y la Política de privacidad.");
  await expect(consent.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/es/terminos");
  await expect(consent.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/es/privacidad");
});

test("outside production the Vercel analytics scripts are not loaded", async ({ page }) => {
  await page.goto("/es");
  await expect(page.locator('script[src^="/_vercel/"]')).toHaveCount(0);
});
