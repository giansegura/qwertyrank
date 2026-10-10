# QwertyRank

Typing speed test with a ranking per language (English, Spanish and Portuguese) and keyboard type (physical or touch), with each player's all-time best. Ranked games are validated by the server.

## Local development

Requirements: Node 24 (`.nvmrc`), pnpm and Docker.

```bash
pnpm install
docker compose up -d          # PostgreSQL, Redis and SRH (emulates the Upstash API)
cp .env.example .env.local    # generate your secrets with: openssl rand -base64 32
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

## Accounts

- Better Auth needs `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in `.env.local` (see `.env.example`).
- **Email link locally:** without `RESEND_API_KEY`, the email isn't sent. The link shows up in the `pnpm dev` console (`[email] …` line). Open it in the same browser.
- **Google (optional):**
  1. In Google Cloud Console → APIs & Services → Credentials, create an "OAuth client ID" of type web application.
  2. Add the redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://qwertyrank.com/api/auth/callback/google`.
  3. Put the ID and the secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

  Without them, the Google button doesn't show up.
- **Resend (production):** verify the domain in Resend and set `RESEND_API_KEY` and `EMAIL_FROM`. In Vercel production the key is required.
- **Passkeys:** added in Settings, with a session less than a day old, and usable to sign in. They don't create accounts.

## Leaderboards

- **Source of truth:** `bests` in PostgreSQL, with each player's best game per language and keyboard: 6 leaderboards, no periods.
- **Redis** keeps one leaderboard per language and keyboard (`lb:{language}:{keyboard}`, no expiry) and computes the positions. `pnpm redis:rebuild --yes` rebuilds it from PostgreSQL and deletes leftover keys.
- **The top 100** on the leaderboard screen is read from PostgreSQL. The page is regenerated every 60 s, and right away when someone enters the top.
- **Anonymous games:** can be saved to an account within the next 10 minutes ("Save it").

## Moderation

- **Human pass:** before a Ranked game, Cloudflare Turnstile runs an invisible challenge; once passed, it's valid for an hour. Locally it's optional: without `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` it isn't requested. In production they're required ("Managed" widget in the Cloudflare dashboard). The E2E tests use Cloudflare's test keys, so they need network access.
- **Anti-cheat thresholds:** in production they come from `ANTICHEAT_CONFIG` (JSON, `docs/launch.md` §6) and aren't in the code, which is public. Locally and in tests the development ones from `src/server/anticheat/config.ts` are used.
- **Limits:** 100 Ranked games per hour per account (or browser) and 150 per IP; 10 reports per day per player.
- **Admins:** `pnpm admin:grant you@email.com` grants the role (and `pnpm admin:revoke` removes it). The panel is at `/admin`; for non-admins, it doesn't exist (404).
- **Rebuild Redis:** `pnpm redis:rebuild` says what it would do; `pnpm redis:rebuild --yes` does it.
- **Against production:** `vercel env pull .env.vercel-prod --environment=production` and then `pnpm redis:rebuild --env .env.vercel-prod [--yes]` (or `pnpm admin:grant you@email.com --env .env.vercel-prod`). With `--env` the script reads only that file and shows the PostgreSQL and Redis hosts before acting. Delete `.env.vercel-prod` when you're done. With a file from a preview deployment (`--environment=preview`), add `REDIS_KEY_PREFIX` by hand with that preview's prefix (`pr-<n>:`): without it, or with `qr:`, the script refuses to act. Never use `.env.production.local` locally: `next build`, `next start` and the E2E tests would load it and act against production.

## Record verification

- **When:** a signed-in game that would enter the top 10 of its leaderboard (counted in PostgreSQL among active players) stays in `review` if its WPM exceed 110% of the player's verified level in that language and keyboard (with no level, always). It doesn't enter the leaderboards until verified.
- **How:** a 30 s game with the text drawn on a `canvas`, with the same keyboard, at least 90% accuracy and 85% of the record's WPM. Up to 3 attempts in 24 h, from the result ("Verify now") or from `/verify`. Passing it publishes all of the player's games in `review` (each with its original time, which breaks ties) and the verified level rises to the record's.
- **Expiry:** decided on read, with no scheduled job. Games from a failed or expired verification stay in `review`, off the leaderboards and the profile.
- **Panel:** `/admin/records` (pending, verified, and failed or expired in the last 7 days) and `/admin/games/<id>` (replay and rhythm of any game). It's read-only: action is taken with the sanctions on the player page.
- **E2E:** players in the leaderboard E2E tests start with a verified level; those in `e2e/verification.spec.ts` play a game of about 140 WPM to enter the top 10 (the `.env.local` database must not have ten faster active non-test players in English) and are deleted at the end. Before each run, `e2e/global-setup.ts` deletes the `@example.com` accounts left by previous runs, with their records and games.

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `pnpm test` | Unit tests (Vitest + jsdom) | — |
| `pnpm test:int` | Integration tests against real PostgreSQL and Redis | `docker compose up -d` |
| `pnpm test:e2e` | E2E tests with Playwright, on desktop and emulated mobile | `docker compose up -d` and `.env.local` |
| `pnpm lint` / `pnpm typecheck` | ESLint and TypeScript | — |
| `pnpm budget` | The home page's (and `/practice`'s) own gzipped JS, on top of `/_not-found`; fails if the home page exceeds 30.0 KB | `pnpm build` first, and `python3` |
| `pnpm lighthouse` | Lighthouse CI on five pages (mobile, simulated slow 4G, three runs each): performance ≥ 90, accessibility and best practices 100, LCP ≤ 3.5 s, CLS ≤ 0.01, TBT ≤ 300 ms, ≤ 200 KB of JS and ≤ 400 KB in all per page, and the SEO audits except `is-crawlable` (`lighthouserc.cjs`). Reports in `lighthouse-report/` | `pnpm build` with the variables `pnpm start` needs, and Chrome (`CHROME_PATH` to use Playwright's) |
| `pnpm load` | k6 load test (`load/ranked.js`): see below | k6, or Docker |

CI (`.github/workflows/ci.yml`) runs all of it on every PR and on `main`, in four jobs: `checks` (lint, types and unit), `integration` (with PostgreSQL, Redis and SRH as services), `e2e` (E2E and `pnpm budget` on its build) and `lighthouse`. In addition, `.github/workflows/pr-title.yml` checks that each PR title follows Conventional Commits (`conventional-title`): with squash, that title is the commit on `main`. All five must pass to merge into `main`. CodeRabbit reviews every PR with `.coderabbit.yaml` (it comments, it doesn't block).

**Typing speed (INP):** `e2e/performance.spec.ts` plays Ranked with the CPU 4x slower and fails if typing's INP reaches 50 ms (spec §2's target). It runs in its own Playwright project (`performance`, desktop), after the others: with no other tests sharing the CPU.

**Load test:** `load/ranked.js` runs players through whole Ranked games (`start`, a batch of keys every 3 s, `finish`) while visitors load pages, and fails if more than 1 % of requests fail or the p95 goes over 500 ms (`start`), 300 ms (`keys`), 1 s (`finish`) or 800 ms (pages). Every game is saved: run it against a disposable database, never production. Locally, against a production build:

```bash
pnpm build && pnpm exec next start --keepAliveTimeout 70000   # with Cloudflare's Turnstile test keys (as in CI) or none
pnpm load                                                     # or: docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 grafana/k6:2.3.0 run - < load/ranked.js
```

`PLAYERS` (peak concurrent games, 50), `VISITORS` (page loads per second, 10), `HOLD` (time at the peak, 3m) and `BASE_URL` change it. Each VU sends its own `x-forwarded-for`, so the per-IP limit doesn't cut the test short (keep `HOLD` under an hour: each VU is one player, with its 100 games per hour); on Vercel the platform overwrites that header and every game counts against k6's IP (150 per hour). `--keepAliveTimeout` avoids a local artifact: Node closes idle connections after 5 s, and through Docker's port forwarding k6 doesn't notice and reuses them.

## Database

- The schema is in `src/server/db/schema.ts`.
- If you change it, generate the migration with `pnpm db:generate --name <name>` and apply it with `pnpm db:migrate`.
- **On Vercel migrations are applied in the build** (`vercel.json`: `pnpm db:migrate && pnpm build`), each preview deployment on its own Neon branch. While the new deployment builds, the previous one keeps serving with the already-migrated database: a migration must also work with the previous code. First add, and in a later deployment remove what's no longer needed.

## Deployment and operations

The guide to opening the beta (accounts, variables and checks) is in [`docs/launch.md`](docs/launch.md).

- **Environments:** production at `qwertyrank.com` and one preview deployment per PR, with its own Neon branch. In preview deployments, `BETTER_AUTH_URL` comes from its branch URL and `REDIS_KEY_PREFIX` is `pr-<PR number>:`.
- **Daily job** (`GET /api/cron/daily`, Vercel Cron at 04:00 UTC, with `CRON_SECRET`):
  - deletes keystrokes older than 30 days, except those of current bests, and first saves a pseudonymous rhythm extract of each (with rounded WPM and accuracy) in `rhythm_samples`, to calibrate risk;
  - removes `anon_id` and `ip_hash` from every game older than 30 days, signed-in or not.

  Locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily`.
- **Sentry**, server only (`src/instrumentation.ts`). Without `SENTRY_DSN` it doesn't start. It only keeps the request method: no URL with its query, no body, no headers, no cookies. Nor the parameters of failed queries, the arguments of `console.error` or console breadcrumbs.
- **Analytics:** Vercel Web Analytics and Speed Insights, production only and with no JS of their own on the home page.
- **Beta:** nothing is indexed while `INDEXABLE` (`src/lib/site.ts`) is `false`.
- **SEO:** every indexable page builds its metadata with `pageMetadata` (`src/lib/seo/`): canonical, `hreflang` and Open Graph with the `SITE_URL` (production) URLs, locally too. Plus `sitemap.xml`, `robots.txt`, JSON-LD and a share image per language (`src/app/[locale]/opengraph-image.tsx`). ICU messages are compiled at build time (`next.config.ts`), so the client doesn't load their parser.
- **Sharing:** every valid Ranked game has its page `/{language}/r/{id}` (not indexed) with its image generated from the database (`src/app/[locale]/r/[id]/`), and a "Share" button when it ends. Under shadow ban or ban the page is a 404 for everyone else; the player sees their own game.
- **Guides:** five guides per language in MDX (`content/{en,es,pt}/`), rendered at build time with `@next/mdx` (no client JS) under `/en/guides`, `/es/guias` and `/pt/guias`, with Article JSON-LD and sitemap entries. To add one: its id in `src/lib/guides.ts`, its route with the slug of every locale in `src/i18n/routing.ts`, its title and description in the `Guides` messages, and the three MDX files. `src/lib/guides-content.test.ts` checks every internal link points to a real page of its locale.

## License

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). If you modify it and your version lets users interact with it remotely over a network, you must offer all of those users its corresponding source code, under this same license, at no charge through a network server (section 13).

The license covers the code, not the brand: the name "QwertyRank", its logo and the `qwertyrank.com` domain may not be used to identify another service or a modified version.
