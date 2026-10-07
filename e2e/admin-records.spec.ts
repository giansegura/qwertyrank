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

/** Jugadores (y admins) de cada prueba: se borran al acabar, con sus partidas y verificaciones. */
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

/** Una cuenta con rol de admin, ya en la portada. */
async function newAdmin(page: Page): Promise<void> {
  const email = await signUp(page, "en");
  created.push((await userIdByEmail(email))!);
  await page.getByTestId("profile-save").click();
  await expect(page).toHaveURL((url) => url.pathname === "/en");
  await setRole(email, "admin");
}

test("un admin ve la cola de récords y reproduce la partida, con los errores en rojo", async ({ page }) => {
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
  // "hxla mundo ", una letra cada 150 ms: 1,5 s de partida.
  await expect(page.getByTestId("replay-time")).toHaveText("1.5 s / 1.5 s", { timeout: 10_000 });
  const first = page.getByTestId("replay-words").getByTestId("word").first();
  await expect(first.locator('[data-status="incorrect"]')).toHaveCount(1);
  await expect(first.locator('[data-status="correct"]')).toHaveCount(3);
  await expect(page.getByTestId("rhythm-chart")).toBeVisible();

  // La ficha del jugador: sus niveles verificados y cada partida, con su modo, enlazada a su reproducción.
  await page.getByTestId("admin-game-title").getByRole("link", { name: nick }).click();
  await expect(page.getByTestId("admin-player-nick")).toHaveText(nick);
  await expect(page.getByTestId("admin-verified-levels")).toContainText("es · physical: 72.5 ppm");
  const link = page.getByTestId("admin-game-link");
  await expect(link).toHaveAttribute("href", `/admin/games/${gameId}`);
  await expect(page.getByRole("row").filter({ has: link })).toContainText("Ranked");
  await link.click();
  await expect(page).toHaveURL(`/admin/games/${gameId}`);
  await expect(page.getByTestId("admin-game-title")).toContainText(nick);
});

test("las partidas con registro antiguo, ilegible, borrado o con eventos raros se abren igual (nunca un 500)", async ({ page }) => {
  const old = await seedPendingVerification(await newPlayer(), { log: "batches" });
  await newAdmin(page);

  expect((await page.goto(`/admin/games/${old.gameId}`))?.status()).toBe(200);
  await expect(page.getByText("se reproduce sin el texto, solo lo tecleado")).toBeVisible();
  await page.getByTestId("replay-play").click();
  await expect(page.getByTestId("replay-words").getByTestId("word").first()).toHaveAttribute("data-word", "hxla", {
    timeout: 10_000,
  });

  // Una sola verificación pendiente por jugador: cada una, de un jugador distinto.
  for (const log of ["broken", "none"] as const) {
    const { gameId } = await seedPendingVerification(await newPlayer(), { log });
    expect((await page.goto(`/admin/games/${gameId}`))?.status()).toBe(200);
    await expect(page.getByTestId("admin-game-no-log")).toBeVisible();
  }

  // Una partida rechazada con eventos raros: `t` negativo, más allá de los 30 s, sin `trusted` o mal formados.
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
      "basura",
    ],
  });
  expect((await page.goto(`/admin/games/${rejected}`))?.status()).toBe(200);
  await expect(page.getByTestId("replay-time")).toHaveText("0.0 s / 31.5 s");
  await expect(page.getByTestId("rhythm-chart")).toBeVisible();
});

test("sin rol de admin no existen; con él, una partida que no existe tampoco", async ({ page }) => {
  const { gameId } = await seedPendingVerification(await newPlayer());
  for (const path of ["/admin/records", `/admin/games/${gameId}`]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  await newAdmin(page);
  for (const path of ["/admin/games/no-es-un-uuid", `/admin/games/${crypto.randomUUID()}`]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
});
