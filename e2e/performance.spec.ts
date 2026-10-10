import { expect, test, type Page } from "@playwright/test";
import { startRanked } from "./helpers/ranked";

type InteractionWindow = Window & { __keys: Map<number, number> };

/**
 * Records each keyboard interaction (its `keydown`, `keypress` and `keyup` share an `interactionId`) with its
 * longest event: the raw material of INP. Events under 16 ms, the lowest threshold the browser allows, don't show up.
 */
async function trackKeyInteractions(page: Page) {
  await page.addInitScript(() => {
    const keys = new Map<number, number>();
    (window as unknown as InteractionWindow).__keys = keys;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { name: string; duration: number; interactionId: number }[]) {
        if (entry.interactionId > 0 && entry.name.startsWith("key")) {
          keys.set(entry.interactionId, Math.max(keys.get(entry.interactionId) ?? 0, entry.duration));
        }
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
}

/** INP as the browser reports it: the slowest interaction, skipping one outlier per 50 interactions. */
function inp(durations: number[], interactionCount: number): number {
  const sorted = durations.toSorted((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(interactionCount / 50))] ?? 0;
}

// Its own project in `playwright.config.ts` (`performance`): desktop Chromium, after the other tests.
test("typing in Ranked responds in under 50 ms (INP) on a 4x slower CPU", async ({ page }) => {
  await trackKeyInteractions(page);
  const words = await startRanked(page, "en", 12);
  const cdp = await page.context().newCDPSession(page);
  // A mid-range phone (spec §2: INP < 50 ms when typing, p75).
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const text = `${words.join(" ")} `;
  await page.keyboard.type(text, { delay: 80 });
  await page.waitForTimeout(500);
  const { durations, interactions } = await page.evaluate(() => ({
    durations: [...(window as unknown as InteractionWindow).__keys.values()],
    // Every interaction the browser counted, fast ones included: proves the keys reached the page.
    interactions: (performance as Performance & { interactionCount: number }).interactionCount,
  }));
  expect(interactions).toBeGreaterThanOrEqual(text.length);
  expect(inp(durations, interactions)).toBeLessThan(50);
});
