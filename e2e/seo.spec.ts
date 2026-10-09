import { expect, type Page, test } from "@playwright/test";

const SITE = "https://qwertyrank.com";

/** A meta's `content`, by `name` or `property`. */
async function meta(page: Page, key: string): Promise<string | null> {
  return page.locator(`meta[name="${key}"], meta[property="${key}"]`).first().getAttribute("content");
}

async function alternates(page: Page): Promise<Record<string, string | null>> {
  const links = page.locator('link[rel="alternate"][hreflang]');
  const entries = await links.evaluateAll((els) =>
    els.map((el) => [el.getAttribute("hreflang") ?? "", el.getAttribute("href")] as const),
  );
  return Object.fromEntries(entries);
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test("practice declares canonical, languages, description and Open Graph", async ({ page }) => {
  const response = await page.goto("/es/practica");
  // The alternates only go in the HTML: next-intl doesn't send the Link header (spec 5b §3.2).
  expect(response?.headers().link).toBeUndefined();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/es/practica`);
  expect(await alternates(page)).toEqual({
    en: `${SITE}/en/practice`,
    es: `${SITE}/es/practica`,
    pt: `${SITE}/pt/pratica`,
    "x-default": `${SITE}/en/practice`,
  });
  expect(await meta(page, "description")).toContain("15 segundos");
  await expect(page).toHaveTitle("Práctica de mecanografía de 15 segundos · QwertyRank");
  expect(await meta(page, "og:title")).toBe("Práctica de mecanografía de 15 segundos · QwertyRank");
  expect(await meta(page, "og:url")).toBe(`${SITE}/es/practica`);
  expect(await meta(page, "og:image")).toBe(`${SITE}/es/opengraph-image`);
  const crumbs = (await jsonLd(page)).find((data) => data["@type"] === "BreadcrumbList");
  expect(crumbs?.itemListElement).toHaveLength(2);
});

test("a leaderboard has its translated URL, its breadcrumbs and its description", async ({ page }) => {
  await page.goto("/pt/ranking/fisico");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/pt/ranking/fisico`);
  expect(await alternates(page)).toMatchObject({ es: `${SITE}/es/ranking/fisico`, "x-default": `${SITE}/en/leaderboard/physical` });
  expect(await meta(page, "description")).toContain("teclado físico");
  expect((await jsonLd(page)).map((data) => data["@type"])).toContain("BreadcrumbList");
});

test("the home page: full title, x-default to the root, JSON-LD, top 10 and explanatory text", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveTitle("QwertyRank — Typing speed test");
  // The root: Next drops the trailing slash when resolving it against `metadataBase`.
  expect((await alternates(page))["x-default"]).toBe(SITE);
  expect(await meta(page, "og:url")).toBe(`${SITE}/en`);
  expect(await meta(page, "og:image")).toBe(`${SITE}/en/opengraph-image`);
  const graph = (await jsonLd(page))[0]["@graph"] as Record<string, unknown>[];
  expect(graph.map((node) => node["@type"])).toEqual(["WebSite", "Organization", "WebApplication"]);
  // In the server HTML, without clicking anything.
  await expect(page.getByTestId("home-top").getByRole("heading", { level: 2 })).toHaveText("Top 10 · physical keyboard");
  await expect(page.getByTestId("home-about").getByRole("link")).toHaveAttribute("href", "/en/practice");
});

test("a legal page: the brand only once and the layout's description", async ({ page }) => {
  await page.goto("/es/privacidad");
  await expect(page).toHaveTitle("Política de privacidad · QwertyRank");
  expect(await meta(page, "og:title")).toBe("Política de privacidad · QwertyRank");
  expect(await meta(page, "description")).toContain("test de mecanografía de 30 segundos");
});

test("utility pages are never indexed", async ({ page }) => {
  await page.goto("/es/entrar");
  expect(await meta(page, "robots")).toContain("noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("sitemap, robots and share image", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml.match(/<loc>/g)).toHaveLength(12);
  expect(xml).toContain(`<loc>${SITE}/es/ranking/tactil</loc>`);
  expect(xml).toContain(`hreflang="pt" href="${SITE}/pt/pratica"`);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);

  const image = await request.get("/pt/opengraph-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
});
