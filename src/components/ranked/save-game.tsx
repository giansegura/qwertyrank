"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { ClaimResponse } from "@/lib/game/types";
import type { PendingVerification } from "@/lib/verification";
import { GameApiError, claimGame } from "./api";
import { RankSummary } from "./rank-summary";

type SaveError = "expired" | "notFound" | "failed";

type State = { name: "saving" } | { name: "saved"; claim: ClaimResponse } | { name: "error"; message: SaveError };

const SAVE_ERRORS: Record<string, SaveError> = { expired: "expired", not_found: "notFound" };

type VerificationGameComponent = typeof import("../verification/verification-game").VerificationGame;

/** Pasa a la cuenta la partida anónima de este navegador (spec §3.7) y enseña sus posiciones. */
export function SaveGame({ gameId }: { gameId: string }) {
  const t = useTranslations("Save");
  const tr = useTranslations("Ranked");
  const router = useRouter();
  const [state, setState] = useState<State>({ name: "saving" });
  const [attempt, setAttempt] = useState(0);
  // "Verificar ahora" (spec 4b §4.1): la partida de verificación, en esta misma pantalla y descargada al
  // pulsarlo; `unavailable` si la descarga falla.
  const [verifying, setVerifying] = useState<PendingVerification | "unavailable" | null>(null);
  const [VerificationGame, setVerificationGame] = useState<VerificationGameComponent | null>(null);

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

  function verify(verification: PendingVerification) {
    setVerifying(verification);
    if (!VerificationGame) {
      import("../verification/verification-game").then(
        (module) => setVerificationGame(() => module.VerificationGame),
        () => setVerifying("unavailable"),
      );
    }
  }

  const playAgain = (
    <Link href="/" className="self-start font-medium underline">
      {t("play")}
    </Link>
  );

  if (state.name === "saving") return <p role="status">{t("saving")}</p>;

  if (verifying === "unavailable") {
    return (
      <p role="alert" className="max-w-md">
        {tr("unavailable")}{" "}
        <Link href="/practice" className="font-medium underline">
          {tr("practiceLink")}
        </Link>
      </p>
    );
  }

  if (verifying) {
    // Al acabar, "Jugar Ranked": a la portada.
    return VerificationGame ? (
      <VerificationGame verification={verifying} onDone={() => router.push("/")} />
    ) : (
      <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
        {tr("verifyLoading")}
      </p>
    );
  }

  if (state.name === "saved") {
    return (
      <div data-testid="save-result" className="flex flex-col gap-4">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("saved")}</p>
        <RankSummary
          ranking={state.claim.ranking}
          gameId={gameId}
          language={state.claim.language}
          inputType={state.claim.inputType}
          onVerify={verify}
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
