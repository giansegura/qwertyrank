"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { ClaimResponse } from "@/lib/game/types";
import { useVerificationModule } from "../verification/use-verification-module";
import { GameApiError, claimGame } from "./api";
import { RankSummary } from "./rank-summary";

type SaveError = "expired" | "notFound" | "failed";

type State = { name: "saving" } | { name: "saved"; claim: ClaimResponse } | { name: "error"; message: SaveError };

const SAVE_ERRORS: Record<string, SaveError> = { expired: "expired", not_found: "notFound" };

/** Moves this browser's anonymous game to the account (spec §3.7) and shows its position. */
export function SaveGame({ gameId }: { gameId: string }) {
  const t = useTranslations("Save");
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "saving" });
  const [attempt, setAttempt] = useState(0);
  // "Verify now" (spec 4b §4.1): the verification game, on this same screen and downloaded when
  // pressed.
  const verification = useVerificationModule();

  useEffect(() => {
    let active = true;
    claimGame(gameId).then(
      (claim) => active && setState({ name: "saved", claim }),
      (error: unknown) => {
        if (!active) return;
        const code = error instanceof GameApiError ? error.code : "";
        setState({ name: "error", message: SAVE_ERRORS[code] ?? "failed" });
      },
    );
    return () => {
      active = false;
    };
  }, [gameId, attempt]);

  function retry() {
    setState({ name: "saving" });
    setAttempt((value) => value + 1);
  }

  const playAgain = (
    <Link href="/" className="self-start font-medium underline">
      {t("play")}
    </Link>
  );

  if (state.name === "saving") return <p role="status">{t("saving")}</p>;

  // When the verification ends, "Play Ranked": to the home page.
  const verifying = verification.view(() => router.push("/"));
  if (verifying) return verifying;

  if (state.name === "saved") {
    return (
      <div data-testid="save-result" className="flex flex-col gap-4">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("saved")}</p>
        <RankSummary
          ranking={state.claim.ranking}
          gameId={gameId}
          language={state.claim.language}
          inputType={state.claim.inputType}
          onVerify={verification.verify}
        />
        {playAgain}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="alert" data-testid="save-error" className="font-medium text-red-700 dark:text-red-400">
        {t(state.message)}
      </p>
      {state.message === "failed" ? (
        <button type="button" onClick={retry} className="self-start font-medium underline">
          {t("retry")}
        </button>
      ) : (
        playAgain
      )}
    </div>
  );
}
