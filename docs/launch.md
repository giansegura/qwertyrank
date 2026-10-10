# Opening the beta: launch guide

Step by step to put QwertyRank on `qwertyrank.com` as a public but low-key beta: not indexed, with the "beta"
badge and no invitations. The code is already ready. Here there are only accounts, variables and checks.
Follow the order, because some steps use what was created in earlier ones.

> All environment variables go in Vercel → *Settings* → *Environment Variables*, separately for
> **Production** and **Preview**. The Neon and Upstash ones are set by their integrations.

## 1. Domain

1. Buy `qwertyrank.com`. Recommended: Cloudflare Registrar (at-cost pricing and free Email Routing).
2. Keep the DNS on Cloudflare. Vercel and Resend will ask you for records later on.

## 2. Email: `privacy@` and `feedback@`

In Cloudflare → *Email* → *Email Routing*:

1. Enable Email Routing for `qwertyrank.com` and verify your personal mailbox as the destination.
2. Create two custom addresses that forward to your mailbox:
   - `privacy@qwertyrank.com`, the one shown in the privacy policy and the terms;
   - `feedback@qwertyrank.com`, the one behind the "beta" badge and "Send us your feedback".
3. **Check:** send an email to each one and make sure it arrives.

## 3. Vercel

1. Create the account (Hobby plan) and import the GitHub repository. The framework is detected automatically.
   `vercel.json` already defines the build (`pnpm db:migrate && pnpm build`), the daily job and the functions'
   region (`fra1`, Frankfurt, next to Neon and Upstash).

   The deployment Vercel triggers when importing the repository **fails** because there is no `DATABASE_URL` yet.
   That's expected: it is redeployed after steps 4 to 6.
2. *Settings* → *General* → *Node.js Version*: 24.x, the one in `.nvmrc`.
3. *Settings* → *Domains*:
   - add `qwertyrank.com`;
   - add `www.qwertyrank.com` with a **308** redirect to `qwertyrank.com`;
   - create in Cloudflare the DNS records Vercel asks for (with the Cloudflare proxy **off**: grey cloud).
4. *Analytics* → enable **Web Analytics**. *Speed Insights* → enable it. The site already loads their scripts in
   production.
5. Leave the default option *Automatically expose System Environment Variables* enabled: preview deployments need it
   for their Better Auth URL and their Redis prefix.

## 4. Neon (PostgreSQL)

1. Create the account and a project in the **Frankfurt** region (`aws-eu-central-1`).
2. In Vercel → *Integrations*, install **Neon**:
   - connect it to the project;
   - enable creating a branch for each preview deployment.

   The integration sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in each environment.
3. **Check:** both show up in *Environment Variables*, in Production and in Preview.
4. On the first PR, check in *Settings* → *Environment Variables* (or in the preview deployment) that the Preview
   `DATABASE_URL` points to a Neon `preview/<branch>` branch and not to `main`. If it points to `main`, the build
   would migrate the production database with the PR's code.

## 5. Upstash (Redis)

1. Create the account and a Redis database in **Frankfurt** (`eu-central-1`).
2. In Vercel → *Integrations*, install **Upstash** and connect it to the project. It sets `UPSTASH_REDIS_REST_URL`
   and `UPSTASH_REDIS_REST_TOKEN`. The app reads exactly those two names: if the integration creates variables with
   other names (for example `KV_REST_API_URL` and `KV_REST_API_TOKEN`), add `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` by hand with the same values.
3. Add `REDIS_KEY_PREFIX=qr:` **in Production only**. Don't set it in preview deployments: each one uses its own
   prefix, `pr-<PR number>:`.
   If `qr:` also reaches Preview, the preview deployment goes green but every request fails with a 500 whose error
   mentions `REDIS_KEY_PREFIX` (environment validation is lazy): remove it from Preview.

## 6. Secrets

Generate each one with `openssl rand -base64 32`, **different in Production and in Preview**:

| Variable | Purpose |
|---|---|
| `ANON_COOKIE_SECRET` | Signs the anonymous cookie |
| `IP_HASH_SECRET` | Daily hash of IPs and of banned identities |
| `BETTER_AUTH_SECRET` | Better Auth sessions |
| `CRON_SECRET` | Protects the daily job. Vercel Cron sends it in `Authorization` |

Also, **in Production only**: `BETTER_AUTH_URL=https://qwertyrank.com`. Preview deployments don't need it: it comes
from their branch URL.

### Anti-cheat thresholds (`ANTICHEAT_CONFIG`)

The code is public, so the production thresholds live only in this variable, **in Production only**. It's a JSON
with the same fields as `DEV_ANTICHEAT_CONFIG` in `src/server/anticheat/config.ts`, on one line:

```
{"timingToleranceMs":…,"burstWindow":…,"burstMedianMs":…,"keydownLookbackMs":…,"touchMultiInsertLimit":…,"wpmCeiling":{"physical":…,"touch":…},"minKeysForSignature":…,"unidentifiedRatio":…,"physicalMinHoldMs":…}
```

- The development values are in the code and in the repository history: production has to use different ones. If
  they are the same, the server doesn't start.
- If it's missing, it doesn't start either. If the JSON is wrong, the error says which field fails, but never shows
  the value.
- Keep them outside the repository (in your password manager). To change them, edit the variable and redeploy.

## 7. Resend (emails)

1. Create the account and add the `qwertyrank.com` domain. Create in Cloudflare the DNS records (SPF, DKIM) it asks
   for and wait until Resend marks it as verified.
2. Create an API key and put it in `RESEND_API_KEY`, in Production and in Preview.
3. `EMAIL_FROM=QwertyRank <noreply@qwertyrank.com>`, also in both.

## 8. Cloudflare Turnstile

1. In Cloudflare → *Turnstile*, create a widget in **Managed** mode for the `qwertyrank.com` domain.
2. **Production:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` with the widget's keys.
3. **Preview:** Cloudflare's test keys, which always pass:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB`
   - `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`

## 9. Google OAuth

1. In Google Cloud Console → *APIs & Services* → *Credentials*, use (or create) the web application client ID and
   add the redirect URI `https://qwertyrank.com/api/auth/callback/google`.
2. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` **in Production only**. In preview deployments, whose URL changes,
   sign-in is with an email link or a passkey.

## 10. Sentry

1. Create the account and pick the **EU** data region when creating the organization: it can't be changed later.
   Create a *Next.js* project. From the setup you only need the DSN.
2. `SENTRY_DSN` in Production and in Preview. Events are told apart by their `environment`.

Sentry runs on the server only. There's no need to touch the code or upload source maps.

## 11. GitHub: protect `main`

In GitHub → *Settings* → *Branches* (or *Rules*), add a rule for `main`:

- require a PR to merge;
- require the **`checks`**, **`integration`**, **`e2e`**, **`lighthouse`** and **`conventional-title`** checks to pass (they show up
  after the first CI run);
- require the branch to be up to date with `main`.

`conventional-title` (`.github/workflows/pr-title.yml`) checks that the PR title follows Conventional Commits: with
squash, that title is the commit on `main`. In *Settings* → *General* → *Pull Requests*, leave only **Allow squash
merging** with **Default commit message: Pull request title** (it's already set that way).

### CodeRabbit (automatic PR review)

1. Install the **CodeRabbit** GitHub app from [coderabbit.ai](https://coderabbit.ai) and give it access only to the
   `qwertyrank` repository. Before that, check its pricing page for what the free plan includes for private
   repositories.
2. It reads the repository's configuration (`.coderabbit.yaml`): it comments on every PR in English, with a
   summary, and takes `AGENTS.md` and `CLAUDE.md` into account.
3. It's not a required check: its comments don't block merging.

## 12. First deployment

1. Merge into `main`. Vercel deploys production and the build applies every migration to the empty database. No need
   for `pnpm redis:rebuild`, because there are no leaderboards to rebuild.
2. Open `https://qwertyrank.com`: the home page should load.
3. Vercel → *Settings* → *Cron Jobs*: `/api/cron/daily` shows up at 04:00 UTC. Click **Run** and look in the
   function logs (Vercel doesn't show the response body) for the `daily retention` line with
   `{ extracted: …, deletedLogs: …, anonymizedGames: …, done: true }`.
   As an alternative to **Run**, this command does return the report JSON. Use the Production `CRON_SECRET`, the
   one from section 6 (*Secrets*; copy it from *Environment Variables*). Paste the value and press Enter (that way
   it doesn't stay in the shell history):

   ```bash
   read -rs CRON_SECRET
   curl -H "Authorization: Bearer $CRON_SECRET" https://qwertyrank.com/api/cron/daily
   ```

   If the variable is marked as *Sensitive* in Vercel, it can't be read again from *Environment Variables*: save it
   when you generate it (§6) or generate a new one.
4. Create your account on the site. Then make yourself admin from your machine:

   ```bash
   vercel login   # once
   vercel link    # once
   vercel env pull .env.vercel-prod --environment=production
   pnpm admin:grant <your-email> --env .env.vercel-prod
   rm .env.vercel-prod
   ```

## 13. Smoke test

- [ ] An anonymous game, "Save it" and create the account: the game moves to your account.
- [ ] Sign in with the email link, with a passkey and with Google.
- [ ] A record that asks for verification, verified from a real **Android** and a real **iPhone**: tapping the text
      opens the keyboard.
- [ ] The leaderboard and your profile show your record.
- [ ] In preview deployments, passkeys only work on the branch URL (`*-git-<branch>-*.vercel.app`), not on the
      deployment's unique URL.
- [ ] The footer: "beta" and "Send us your feedback" open an email to `feedback@`; Privacy and Terms load in all
      three languages.
- [ ] `curl -sI https://qwertyrank.com/en | grep -i x-robots-tag` returns `noindex`.
- [ ] Sentry receives errors. In a preview deployment:
      1. set a wrong `UPSTASH_REDIS_REST_TOKEN` in **Preview** only and redeploy it;
      2. click *Start* in Ranked: the Redis failure shows up in Sentry with `environment: preview`;
      3. restore the variable.
- [ ] Web Analytics records your visits when navigating between pages.

## 14. Weekly monitoring

- Vercel → *Usage*: function invocations, requests and CPU against the Hobby limits (general spec §8.7). If anything
  goes over 60–70%, it's time to consider the Pro plan.
- Sentry: new errors.
- Neon and Upstash: storage and commands against their free plans.

## When the beta ends (phase 5)

- `INDEXABLE = true` in `src/lib/site.ts`: removes the `noindex`.
- Then submit `https://qwertyrank.com/sitemap.xml` to Google Search Console and Bing Webmaster Tools.
- Have a lawyer review the privacy policy and the terms.
- Before announcing it, run the load test (README → Tests → *Load test*) on a production build and check its thresholds.
- In `lighthouserc.cjs`, add `is-crawlable` to `SEO_AUDITS`: once indexable, a page that blocks crawlers must fail.
