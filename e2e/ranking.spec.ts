import { expect, test } from "@playwright/test";
import {
  closeDb,
  randomClientIp,
  seedVerifiedLevels,
  signUp,
  signUpOnLoginPage,
  userIdByEmail,
  verdictsOf,
} from "./helpers/accounts";
import { switchLocale } from "./helpers/locale";
import { playValidGame } from "./helpers/ranked";

test.describe.configure({ timeout: 120_000 });

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

test("with an account: the game gets its position, shows up on the leaderboard and on the profile", async ({ page }) => {
  // Already verified: their game is published even if it enters the top 10 (spec 4b §2.1).
  await seedVerifiedLevels(await signUp(page, "en"));
  const nick = `e2e_${crypto.randomUUID().slice(0, 8)}`;
  await page.getByTestId("profile-nick").fill(nick);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  // The leaderboard is already cached (ISR) before playing: this checks that entering the top 100 revalidates it.
  for (const input of ["physical", "touch"]) await page.goto(`/en/leaderboard/${input}`);

  await playValidGame(page);
  const summary = page.getByTestId("rank-summary");
  await expect(summary).toContainText(/#\d+ on the leaderboard/);
  await expect(summary).toContainText("New personal best!");

  await summary.getByRole("link", { name: "View ranking" }).click();
  await expect(page).toHaveURL(/\/en\/leaderboard\/(physical|touch)$/);
  const position = page.getByTestId("my-position");
  await expect(position).toContainText(/Your position: #\d+/);
  const rank = Number((await position.textContent())!.match(/#(\d+)/)![1]);
  // On entering the top 100 the page is revalidated right away: the player is already in the table.
  if (rank <= 100) await expect(page.locator(`[data-testid="leaderboard-row"][data-nick="${nick}"]`)).toBeVisible();

  await page.goto(`/en/u/${nick}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nick);
  await expect(page.getByTestId("profile-records").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("profile-history").locator("li")).toHaveCount(1);
});

test("anonymous: \"Save it\" leads to creating the account and the game moves to it", async ({ page }) => {
  // In English: Playwright types accented letters by inserting text without pressing keys, and the
  // anti-cheat (rightly) rejects that game as injected text.
  await playValidGame(page, "en");
  await expect(page.getByTestId("rank-summary")).toContainText(/You'd be #\d+ on the leaderboard/);
  await page.getByTestId("save-game").click();
  await expect(page).toHaveURL(/\/en\/sign-in\?next=%2Fen%2Fsave%2F/);

  const email = await signUpOnLoginPage(page);
  await seedVerifiedLevels(email);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL(/\/en\/save\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("save-result")).toContainText("Game saved to your account.");
  await expect(page.getByTestId("rank-summary")).toContainText(/#\d+ on the leaderboard/);

  const userId = await userIdByEmail(email);
  expect(await verdictsOf(userId!)).toEqual(["valid"]);
});

test("leaderboard: opens the device's keyboard, only filters by keyboard and the URL is translated when switching language", async ({
  page,
  isMobile,
}) => {
  await page.goto("/es/ranking");
  await expect(page).toHaveURL(isMobile ? /\/es\/ranking\/tactil$/ : /\/es\/ranking\/fisico$/);
  await expect(page.getByRole("navigation", { name: "Teclado" }).getByRole("link")).toHaveText(["Teclado físico", "Teclado táctil"]);
  await expect(page.getByText("Se reinicia en")).toHaveCount(0);

  await switchLocale(page, "en");
  await expect(page).toHaveURL(isMobile ? /\/en\/leaderboard\/touch$/ : /\/en\/leaderboard\/physical$/);

  await page.goto("/en/ranking/fisico");
  await expect(page).toHaveURL(/\/en\/leaderboard\/physical$/);
});

test("old URLs with a period no longer exist", async ({ request }) => {
  for (const path of ["/es/ranking/fisico/hoy", "/en/leaderboard/physical/today", "/pt/ranking/tatil/sempre"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
