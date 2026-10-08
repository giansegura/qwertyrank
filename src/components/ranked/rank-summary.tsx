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

// RankedTest descarga este módulo durante la partida y saca de él también la partida de verificación de
// "Verificar ahora" (spec 4b §4.1): con un solo `import()`, la portada no paga otro.
export { LazyVerificationGame } from "../verification/use-verification-module";

export interface RankSummaryProps {
  ranking: GameRanking;
  gameId: string;
  /** Idioma del test: el ranking es el de ese idioma (spec §3.2), aunque la página esté en otro. */
  language: TestLanguage;
  inputType: InputType;
  /** "Verificar ahora" en la misma pantalla (spec 4b §4.1). Sin él (tras «Guárdalo»), lleva a `/verify`. */
  onVerify?: (verification: PendingVerification) => void;
}

/** Intentos y horas que le quedan a una verificación. Las horas, solo en el navegador (`useNow`). */
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

/** Posición de la partida en el ranking, o la que tendría si se guarda (spec §3.4, paso 7) o se verifica (spec 4b §4.1). */
export function RankSummary({ ranking, gameId, language, inputType, onVerify }: RankSummaryProps) {
  const t = useTranslations("Ranked");
  const tv = useTranslations("Verification");

  // Un récord en `review` (tras la partida o tras «Guárdalo») abre o renueva una verificación: el aviso de
  // la cabecera vuelve a pedir las pendientes. Aquí y no en RankedTest: este módulo no pesa en la portada.
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
          href={leaderboardHref(inputType, "all")}
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
          // Sin intentos (p. ej. gastados en otro dispositivo mientras tanto): ya no se puede verificar.
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
    // Spec §8.4: aviso "ranking no disponible temporalmente". La partida anónima está guardada y se puede reclamar.
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
