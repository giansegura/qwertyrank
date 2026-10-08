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

const LEGAL = [
  { locale: "en", privacy: "/en/privacy", terms: "/en/terms", privacyTitle: "Privacy policy", termsTitle: "Terms of use" },
  { locale: "es", privacy: "/es/privacidad", terms: "/es/terminos", privacyTitle: "Política de privacidad", termsTitle: "Términos de uso" },
  { locale: "pt", privacy: "/pt/privacidade", terms: "/pt/termos", privacyTitle: "Política de privacidade", termsTitle: "Termos de uso" },
] as const;

for (const { locale, privacy, terms, privacyTitle, termsTitle } of LEGAL) {
  test(`el pie lleva a la política de privacidad y a los términos (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await page.getByTestId("site-footer").locator(`a[href="${privacy}"]`).click();
    await expect(page).toHaveURL((url) => url.pathname === privacy);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(privacyTitle);

    await page.getByTestId("site-footer").locator(`a[href="${terms}"]`).click();
    await expect(page).toHaveURL((url) => url.pathname === terms);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(termsTitle);
  });
}

test("la beta y los comentarios abren un correo; el pie se ve sin hacer scroll", async ({ page, isMobile }) => {
  await page.goto("/es");
  const footer = page.getByTestId("site-footer");
  await expect(footer).toBeInViewport();
  await expect(footer.getByRole("link", { name: "beta" })).toHaveAttribute("href", "mailto:feedback@qwertyrank.com");
  await expect(footer.getByRole("link", { name: "Envíanos tus comentarios" })).toHaveAttribute(
    "href",
    "mailto:feedback@qwertyrank.com",
  );
  // La etiqueta de la cabecera, solo en escritorio: en un móvil partiría la línea de la cabecera.
  await expect(page.getByTestId("beta-badge")).toBeVisible({ visible: !isMobile });
});

test("al entrar, el aviso enlaza a los términos y a la política de privacidad", async ({ page }) => {
  await page.goto("/es/entrar");
  const consent = page.getByTestId("login-consent");
  await expect(consent).toContainText("Al crear una cuenta aceptas los Términos y la Política de privacidad.");
  await expect(consent.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/es/terminos");
  await expect(consent.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/es/privacidad");
});

test("fuera de producción no se cargan los scripts de analítica de Vercel", async ({ page }) => {
  await page.goto("/es");
  await expect(page.locator('script[src^="/_vercel/"]')).toHaveCount(0);
});
