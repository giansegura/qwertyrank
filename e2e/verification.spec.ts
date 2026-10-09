import { expect, test, type Page } from "@playwright/test";
import {
  closeDb,
  deleteAccount,
  randomClientIp,
  seedPendingVerification,
  signUp,
  userIdByEmail,
  verdictsOf,
} from "./helpers/accounts";
import { startRanked } from "./helpers/ranked";

test.describe.configure({ timeout: 120_000 });

/** Accounts of each test: deleted at the end, so their records don't take the next one's top 10. */
const created: string[] = [];

test.afterEach(async () => {
  for (const userId of created.splice(0)) await deleteAccount(userId);
});

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

/**
 * Creates an account in English, saves the welcome page and returns to the home page. Returns its id. The
 * account is queued for deletion as soon as it exists: if the welcome page fails, it doesn't stay in the database either.
 */
async function newAccount(page: Page, nick?: string): Promise<string> {
  const email = await signUp(page, "en");
  const userId = (await userIdByEmail(email))!;
  created.push(userId);
  if (nick) await page.getByTestId("profile-nick").fill(nick);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  return userId;
}

test("without a session, /verify leads to sign-in and back", async ({ page }) => {
  await page.goto("/es/verificar");
  await expect(page).toHaveURL(/\/es\/entrar\?next=%2Fes%2Fverificar$/);
});

test("the pending record notice leads to /verify, which starts its verification game", async ({ page }) => {
  const userId = await newAccount(page);
  await seedPendingVerification(userId, { wpm: 80 });
  await page.reload();

  const notice = page.getByTestId("verify-notice");
  await expect(notice).toContainText(/Record pending verification · 2[34] h left/);
  await notice.click();
  await expect(page).toHaveURL(/\/en\/verify$/);
  await expect(page.getByTestId("verify-item")).toContainText("you need 68 wpm · 3 attempts");

  await page.getByTestId("verify-start").click();
  await expect(page.getByTestId("verify-countdown")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("verify-canvas")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
  await expect(page.getByTestId("word")).toHaveCount(0);
});

/**
 * A Ranked game that enters the top 10: 60 words at one key every ~55 ms in 30 s (about 140 WPM),
 * more than any other signed-in E2E game (6 words, ~14 WPM; this test's are deleted at the end, and
 * those from previous runs at the start: `global-setup.ts`). Waits for the result, in `review`.
 */
async function playRecord(page: Page): Promise<void> {
  const words = await startRanked(page, "en", 60);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 50 });
  await expect(page.getByTestId("rank-summary")).toContainText("Your score would be #", { timeout: 40_000 });
}

/** Clicks "Verify now" and returns the verification game's words: the canvas doesn't show them in the DOM. */
async function startVerification(page: Page): Promise<string[]> {
  const started = page.waitForResponse(
    (response) => response.url().endsWith("/api/game/start") && response.request().postDataJSON()?.mode === "verification",
  );
  await page.getByTestId("verify-now").click();
  const { words } = (await (await started).json()) as { words: string[] };
  await expect(page.getByTestId("verify-countdown")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("verify-canvas")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
  await expect(page.getByTestId("word")).toHaveCount(0);
  return words;
}

test("enters a top 10, verifies by typing on the canvas and the record shows up on the leaderboard", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 740 });
  const nick = `e2e_v${crypto.randomUUID().slice(0, 8)}`;
  await newAccount(page, nick);
  await playRecord(page);

  const words = await startVerification(page);
  const canvas = page.getByTestId("verify-canvas");
  // Sharp: draws at the device's resolution, and fits on the screen.
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    css: element.clientWidth,
    dpr: window.devicePixelRatio,
  }));
  expect(size.width).toBe(Math.round(size.css * size.dpr));
  if (isMobile) {
    expect(size.dpr).toBeGreaterThanOrEqual(2);
    expect(size.css).toBeLessThanOrEqual(360 - 32);
    // Tapping the text focuses the hidden field: the one that opens the phone's keyboard. The game already
    // focuses it on start (without the player's tap, the phone doesn't open the keyboard): remove it first.
    const input = page.getByTestId("typing-input");
    await input.evaluate((element: HTMLInputElement) => element.blur());
    await expect(input).not.toBeFocused();
    await canvas.tap();
    await expect(input).toBeFocused();
  }

  // More words than in the record, at the same pace: beats 85% of its WPM.
  await page.keyboard.type(`${words.slice(0, 70).join(" ")} `, { delay: 50 });
  const result = page.getByTestId("verify-result");
  await expect(result).toContainText("Verified! Your record is now on the ranking.", { timeout: 40_000 });
  await result.getByRole("link", { name: "View ranking" }).click();
  await expect(page.locator(`[data-testid="leaderboard-row"][data-nick="${nick}"]`)).toBeVisible();
});

test("typing slowly doesn't verify: attempts remain and the record doesn't show up on the leaderboard", async ({ page }) => {
  const nick = `e2e_v${crypto.randomUUID().slice(0, 8)}`;
  const userId = await newAccount(page, nick);
  await playRecord(page);

  const words = await startVerification(page);
  await page.keyboard.type(`${words.slice(0, 3).join(" ")} `, { delay: 200 });
  await expect(page.getByTestId("verify-result")).toContainText(/You were [\d.]+ wpm short\. You have 2 attempts left\./, {
    timeout: 40_000,
  });
  await expect(page.getByTestId("verify-retry")).toBeVisible();

  expect(await verdictsOf(userId)).toContain("review");
  for (const input of ["physical", "touch"]) {
    await page.goto(`/en/leaderboard/${input}`);
    await expect(page.locator(`[data-testid="leaderboard-row"][data-nick="${nick}"]`)).toHaveCount(0);
  }
});
