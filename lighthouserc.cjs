// Lighthouse CI (spec 5e §2): lab limits on the production build, mobile emulation with simulated slow 4G.
// `pnpm lighthouse` after `pnpm build`; the CI job runs it on every PR. Reports land in `lighthouse-report/`.

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;

/** One page of each kind: the home page, a test, a leaderboard, a guide and a legal page, across the three languages. */
const PAGES = ["/en", "/es/practica", "/pt/ranking/fisico", "/en/guides/wpm-vs-cpm", "/es/privacidad"];

/** SEO audits that must hold now. `is-crawlable` is left out: the beta is `noindex` until launch (spec 5a §5). */
const SEO_AUDITS = ["document-title", "meta-description", "http-status-code", "link-text", "crawlable-anchors", "hreflang", "canonical"];

module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm start --port ${PORT}`,
      startServerReadyPattern: "Ready",
      url: PAGES.map((path) => `${BASE}${path}`),
      // Three runs per page; the assertions use the median (below), which absorbs a noisy run.
      numberOfRuns: 3,
      // Without the sandbox: Ubuntu 24.04 runners restrict the user namespaces Chrome's sandbox needs. Only localhost is visited.
      settings: { chromeFlags: "--headless=new --no-sandbox" },
    },
    assert: {
      aggregationMethod: "median",
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 1 }],
        // Lab values, not the field targets of the spec (§2): on a throttled mobile they run higher.
        "largest-contentful-paint": ["error", { maxNumericValue: 3_500 }],
        // The spec's target is 0 (and `layout-shift.spec.ts` checks the game itself); 0.01 tolerates a sub-pixel shift.
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.01 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
        // Compressed bytes per page: all its JavaScript (framework included) and everything together.
        "resource-summary:script:size": ["error", { maxNumericValue: 200 * 1024 }],
        "total-byte-weight": ["error", { maxNumericValue: 400 * 1024 }],
        ...Object.fromEntries(SEO_AUDITS.map((audit) => [audit, "error"])),
      },
    },
    upload: { target: "filesystem", outputDir: "lighthouse-report" },
  },
};
