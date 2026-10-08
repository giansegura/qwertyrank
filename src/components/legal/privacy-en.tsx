import { Link } from "@/i18n/navigation";
import { CONTROLLER, PRIVACY_EMAIL } from "@/lib/site";

const MAIL = `mailto:${PRIVACY_EMAIL}`;

/** Política de privacidad en inglés (spec 5a §4.2). Borrador para la beta: pendiente de revisión legal. */
export function PrivacyEn() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>Last updated: October 8, 2026.</p>
      <p>
        QwertyRank is a website to measure and compare your typing speed, and it is in beta. This page explains what
        data we process, why, and what your rights are.
      </p>

      <h2>Who is responsible</h2>
      <p>
        {CONTROLLER} (Spain). For anything about your data: <a href={MAIL}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>What data we process</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email, the nickname you choose and, if you add it, your country. If you sign in
          with Google, your Google account ID and the email it shares with us.
        </li>
        <li>
          <strong>Games:</strong> words per minute, accuracy, language, keyboard type, when you played, and your
          keystrokes with their timing (which key and when), which we use to validate the game and detect cheating.
        </li>
        <li>
          <strong>Browser:</strong> a cookie with an anonymous ID, so a game you played without signing in can be saved
          to your account.
        </li>
        <li>
          <strong>IP address:</strong> we never store it as is, only a hashed digest that changes every day, to
          limit abuse.
        </li>
        <li>
          <strong>Banned accounts:</strong> if an account is banned for cheating, we keep a hashed fingerprint of
          its email and Google account so it cannot sign up again.
        </li>
      </ul>

      <h2>Why, and on what legal basis</h2>
      <ul>
        <li>
          To provide the service (your account, your public profile and your place on the leaderboard): performance of
          the contract you accept when you create an account.
        </li>
        <li>
          To validate games and prevent cheating and abuse (checking keystrokes, limiting games, verifying records,
          sanctioning accounts and keeping banned ones from signing up again): our legitimate interest in a fair
          leaderboard and a secure service.
        </li>
      </ul>

      <h2>How long</h2>
      <ul>
        <li>
          Keystrokes: 30 days. Those of your best score on each leaderboard are kept while it remains your best, so it
          can be reviewed.
        </li>
        <li>
          Before deleting keystrokes we keep an anonymous extract of their rhythm (time between keys, with no text, no
          keys and no identifiers, so it is pseudonymised) to improve cheat detection. It is kept with no time limit on the
          basis of our legitimate interest in calibrating anti-cheat.
        </li>
        <li>
          Games played without an account: after 30 days their anonymous ID and IP digest are deleted; only the figures
          remain, for statistics.
        </li>
        <li>
          Your account: until you delete it. When you do, we delete your email, nickname, country, sessions, passkeys,
          best scores and the keystrokes of your games, and you leave the leaderboards; your games become anonymous.
        </li>
        <li>Fingerprints of banned accounts: indefinitely, while they are needed to prevent fraud.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We do not sell your data or use it for advertising. These providers process it on our behalf: Vercel (hosting
        and cookieless analytics), Neon (database), Upstash (temporary data and leaderboards), Resend (emails),
        Cloudflare (Turnstile, the anti-bot check), Sentry (server error logging) and Google, only if you sign in with
        Google. Some are outside the European Union, mainly in the United States: those transfers rely on each
        provider&apos;s safeguards (standard contractual clauses or the EU-US Data Privacy Framework).
      </p>

      <h2>Cookies</h2>
      <p>
        We only use cookies that are strictly necessary for the site to work: your session, the anonymous ID, the one
        that remembers you passed the anti-bot check, and your language. We use no advertising or analytics cookies, so
        we do not ask for consent. Vercel&apos;s analytics uses no cookies.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct and delete your data, object to or restrict its processing, and ask for a copy. To
        delete your account and all your data, use &quot;Delete my account&quot; on the <Link href="/settings">Your account</Link> page.
        For anything else, write to <a href={MAIL}>{PRIVACY_EMAIL}</a>. If you think we have not handled your data
        properly, you can complain to the Spanish Data Protection Agency (<a href="https://www.aepd.es">aepd.es</a>) or
        to the authority in your country.
      </p>

      <h2>Minimum age</h2>
      <p>You must be at least 14 to create an account.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we will update the date above and, if the change is significant, let you know.</p>
    </>
  );
}
