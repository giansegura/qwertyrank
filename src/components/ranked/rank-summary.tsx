"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import type { InputType } from "@/lib/game/types";
import { leaderboardHref } from "@/lib/leaderboard/slugs";
import type { GameRanking } from "@/lib/leaderboard/types";
import { hoursLeft, type PendingVerification } from "@/lib/verification";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
import type { TestLanguage } from "@/lib/words/languages";
import { useNow } from "../use-now";

// RankedTest downloads this module during the game and also takes from it the verification game for
// "Verify now" (spec 4b §4.1): with a single `import()`, the home page does not pay for another.
export { LazyVerificationGame } from "../verification/use-verification-module";
// The "Share" button (spec 5d §6) ships in this same module: the home page does not pay for another `import()`.
export { ShareResult } from "./share-result";

export interface RankSummaryProps {
  ranking: GameRanking;
  gameId: string;
  /** Language of the test: the ranking is that language's (spec §3.2), even if the page is in another. */
  language: TestLanguage;
  inputType: InputType;
  /** "Verify now" on the same screen (spec 4b §4.1). Without it (after "Save it"), goes to `/verify`. */
  onVerify?: (verification: PendingVerification) => void;
}

/** Attempts and hours left for a verification. The hours only in the browser (`useNow`). */
function ReviewLeft({ verification }: { verification: PendingVerification }) {
  const t = useTranslations("Ranked");
  const now = useNow();
  return (
    <p className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
      {now !== null &&
        t("reviewLeft", { attempts: verification.attemptsLeft, hours: hoursLeft(verification.expiresAt, now) })}
    </p>
  );
}

/** Position of the game in the ranking, or the one it would have if saved (spec §3.4, step 7) or verified (spec 4b §4.1). */
export function RankSummary({ ranking, gameId, language, inputType, onVerify }: RankSummaryProps) {
  const t = useTranslations("Ranked");
  const tv = useTranslations("Verification");

  // A record in `review` (after the game or after "Save it") opens or renews a verification: the header
  // notice requests the pending ones again. Here and not in RankedTest: this module does not weigh on the home page.
  useEffect(() => {
    if (ranking.kind === "review") window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
  }, [ranking]);

  const saveIt = (
    <>
      <Link
        data-testid="save-game"
        href={{ pathname: "/save/[gameId]", params: { gameId } }}
        className="rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400"
      >
        {t("saveIt")}
      </Link>
      <p className="w-full text-sm text-zinc-500 dark:text-zinc-400">{t("saveHint")}</p>
    </>
  );

  if (ranking.kind === "ranked") {
    return (
      <div data-testid="rank-summary" className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="font-medium">{t("rank", { rank: ranking.rank })}</p>
        {ranking.improved && <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("newBest")}</p>}
        <Link
          href={leaderboardHref(inputType)}
          locale={language}
          prefetch={false}
          className="text-sm underline"
        >
          {t("viewLeaderboard")}
        </Link>
      </div>
    );
  }

  if (ranking.kind === "review") {
    const { verification } = ranking;
    const verifyClass = "self-start rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400";
    return (
      <div data-testid="rank-summary" className="flex flex-col gap-1">
        <p className="font-medium">{t("reviewWouldRank", { rank: ranking.rank })}</p>
        {verification.attemptsLeft > 0 ? (
          <>
            <p className="text-sm">{t("reviewExplain", { required: verification.requiredWpm })}</p>
            <ReviewLeft verification={verification} />
            {onVerify ? (
              <button type="button" data-testid="verify-now" onClick={() => onVerify(verification)} className={verifyClass}>
                {t("verifyNow")}
              </button>
            ) : (
              <Link data-testid="verify-now" href="/verify" className={verifyClass}>
                {t("verifyNow")}
              </Link>
            )}
          </>
        ) : (
          // No attempts left (e.g. used up on another device in the meantime): it can no longer be verified.
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{tv("exhausted")}</p>
        )}
      </div>
    );
  }

  if (ranking.kind === "would_rank") {
    return (
      <div data-testid="rank-summary" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-medium">{t("wouldRank", { rank: ranking.rank })}</p>
        {saveIt}
      </div>
    );
  }

  if (ranking.kind === "unavailable") {
    // Spec §8.4: "ranking temporarily unavailable" notice. The anonymous game is saved and can be claimed.
    return (
      <div data-testid="rank-summary" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="w-full text-sm text-zinc-600 dark:text-zinc-400">{t("rankingUnavailable")}</p>
        {ranking.canSave && saveIt}
      </div>
    );
  }

  if (ranking.kind === "low_accuracy") {
    return (
      <p data-testid="rank-summary" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("lowAccuracy")}
      </p>
    );
  }

  return null;
}
