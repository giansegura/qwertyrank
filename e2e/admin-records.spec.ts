import { expect, test, type Page } from "@playwright/test";
import {
  closeDb,
  deleteAccount,
  randomClientIp,
  seedPendingVerification,
  seedPlayer,
  seedRejectedGame,
  seedVerifiedLevel,
  setRole,
  signUp,
  userIdByEmail,
} from "./helpers/accounts";

test.describe.configure({ timeout: 120_000 });

/** Players (and admins) of each test: deleted at the end, with their games and verifications. */
const created: string[] = [];

async function newPlayer(nick = `e2e_o${crypto.randomUUID().slice(0, 8)}`): Promise<string> {
  const userId = await seedPlayer(nick);
  created.push(userId);
  return userId;
}

test.afterEach(async () => {
  for (const userId of created.splice(0)) await deleteAccount(userId);
});

test.afterAll(async () => {
  await closeDb();
});

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomClientIp() });
});

/** An account with the admin role, already on the home page. */
async function newAdmin(page: Page): Promise<void> {
  const email = await signUp(page, "en");
  created.push((await userIdByEmail(email))!);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  await setRole(email, "admin");
}

test("an admin sees the record queue and replays the game, with errors in red", async ({ page }) => {
  const nick = `e2e_r${crypto.randomUUID().slice(0, 8)}`;
  const player = await newPlayer(nick);
  await seedVerifiedLevel(player, { language: "es", inputType: "physical", wpm: 72.5 });
  const { gameId } = await seedPendingVerification(player, { wpm: 91 });
  await newAdmin(page);

  await page.goto("/admin/records");
  const row = page.getByTestId("admin-records-pending").locator(`[data-testid="admin-record-row"][data-nick="${nick}"]`);
  await expect(row).toContainText("91.0");
  await row.getByTestId("admin-record-replay").click();
  await expect(page).toHaveURL(`/admin/games/${gameId}`);
  await expect(page.getByTestId("admin-game-title")).toContainText(nick);

  await page.getByTestId("replay-speed-4").click();
  await page.getByTestId("replay-play").click();
  // "hxla mundo ", one letter every 150 ms: a 1.5 s game.
  await expect(page.getByTestId("replay-time")).toHaveText("1.5 s / 1.5 s", { timeout: 10_000 });
  const first = page.getByTestId("replay-words").getByTestId("word").first();
  await expect(first.locator('[data-status="incorrect"]')).toHaveCount(1);
  await expect(first.locator('[data-status="correct"]')).toHaveCount(3);
  await expect(page.getByTestId("rhythm-chart")).toBeVisible();

  // The player's page: their verified levels and every game, with its mode, linked to its replay.
  await page.getByTestId("admin-game-title").getByRole("link", { name: nick }).click();
  await expect(page.getByTestId("admin-player-nick")).toHaveText(nick);
  await expect(page.getByTestId("admin-verified-levels")).toContainText("es · physical: 72.5 wpm");
  const link = page.getByTestId("admin-game-link");
  await expect(link).toHaveAttribute("href", `/admin/games/${gameId}`);
  await expect(page.getByRole("row").filter({ has: link })).toContainText("Ranked");
  await link.click();
  await expect(page).toHaveURL(`/admin/games/${gameId}`);
  await expect(page.getByTestId("admin-game-title")).toContainText(nick);
});

test("games with an old, unreadable, deleted or odd-event log still open (never a 500)", async ({ page }) => {
  const old = await seedPendingVerification(await newPlayer(), { log: "batches" });
  await newAdmin(page);

  expect((await page.goto(`/admin/games/${old.gameId}`))?.status()).toBe(200);
  await expect(page.getByText("it is replayed without the text, only what was typed")).toBeVisible();
  await page.getByTestId("replay-play").click();
  await expect(page.getByTestId("replay-words").getByTestId("word").first()).toHaveAttribute("data-word", "hxla", {
    timeout: 10_000,
  });

  // Only one pending verification per player: each one from a different player.
  for (const log of ["broken", "none"] as const) {
    const { gameId } = await seedPendingVerification(await newPlayer(), { log });
    expect((await page.goto(`/admin/games/${gameId}`))?.status()).toBe(200);
    await expect(page.getByTestId("admin-game-no-log")).toBeVisible();
  }

  // A rejected game with odd events: negative `t`, beyond 30 s, without `trusted` or malformed.
  const rejected = await seedRejectedGame(await newPlayer(), {
    words: ["hola", "mundo"],
    batches: [
      {
        seq: 1,
        arrivedAt: 0,
        events: [
          { t: -40, type: "input", deleted: 0, inserted: "h", trusted: false },
          { t: 200, type: "down", key: "o", code: "KeyO" },
          { t: "300", type: "input", deleted: 0, inserted: "x" },
          { t: 400, type: "input", deleted: -3, inserted: "x" },
          null,
          { t: 31_500, type: "input", deleted: 0, inserted: "o", trusted: true },
        ],
      },
      "garbage",
    ],
  });
  expect((await page.goto(`/admin/games/${rejected}`))?.status()).toBe(200);
  await expect(page.getByTestId("replay-time")).toHaveText("0.0 s / 31.5 s");
  await expect(page.getByTestId("rhythm-chart")).toBeVisible();
});

test("without the admin role they don't exist; with it, neither does a game that doesn't exist", async ({ page }) => {
  const { gameId } = await seedPendingVerification(await newPlayer());
  for (const path of ["/admin/records", `/admin/games/${gameId}`]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  await newAdmin(page);
  for (const path of ["/admin/games/no-es-un-uuid", `/admin/games/${crypto.randomUUID()}`]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
});
