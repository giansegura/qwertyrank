import { Link } from "@/i18n/navigation";
import { FEEDBACK_EMAIL, PRIVACY_EMAIL } from "@/lib/site";

/** Términos de uso en inglés (spec 5a §4.3). Borrador para la beta: pendiente de revisión legal. */
export function TermsEn() {
  return (
    <>
      <h1>Terms of use</h1>
      <p>Last updated: October 8, 2026.</p>
      <p>
        By using QwertyRank you accept these terms. If you create an account, you also accept the{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>

      <h2>The service</h2>
      <p>
        QwertyRank is a free typing speed test with leaderboards, currently in beta. We provide it &quot;as is&quot;: it
        may have bugs, change or be interrupted, and during the beta leaderboards may be corrected or reset if
        something goes wrong.
      </p>

      <h2>Your account</h2>
      <p>
        You must be at least 14. You are responsible for what is done with your account. Your nickname must not be
        offensive or impersonate anyone.
      </p>

      <h2>Fair play</h2>
      <p>
        Using bots, scripts, macros, pasted or injected text, or any other way of faking a game is forbidden, as is
        trying to get around the limits or the record verification.
      </p>

      <h2>Sanctions</h2>
      <p>
        If you break these terms we may, without prior notice, hide your scores from the leaderboard (only you will see
        them), change your nickname, or ban your account and keep you from signing up again. If you think it is a
        mistake, write to us.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, we are not liable for damages arising from the use of the service or its
        unavailability. Nothing here limits your rights as a consumer under the law.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by Spanish law.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. For feedback about the beta:{" "}
        <a href={`mailto:${FEEDBACK_EMAIL}`}>{FEEDBACK_EMAIL}</a>.
      </p>
    </>
  );
}
