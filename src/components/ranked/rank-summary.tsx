"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { InputType } from "@/lib/game/types";
import { VISIBLE_PERIODS } from "@/lib/leaderboard/periods";
import { leaderboardHref } from "@/lib/leaderboard/slugs";
import type { GameRanking } from "@/lib/leaderboard/types";
import type { TestLanguage } from "@/lib/words/languages";

export interface RankSummaryProps {
  ranking: GameRanking;
  gameId: string;
  /** Idioma del test: el ranking es el de ese idioma (spec §3.2), aunque la página esté en otro. */
  language: TestLanguage;
  inputType: InputType;
}

/** Posición de la partida en cada periodo, o la que tendría si se guarda (spec §3.4, paso 7). */
export function RankSummary({ ranking, gameId, language, inputType }: RankSummaryProps) {
  const t = useTranslations("Ranked");

  if (ranking.kind === "ranked") {
    return (
      <div data-testid="rank-summary" className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="font-medium">
          {VISIBLE_PERIODS.map((period) => t("rankIn", { rank: ranking.ranks[period], period })).join(" · ")}
        </p>
        {ranking.improved.length > 0 && (
          <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("newBest")}</p>
        )}
        <Link href={leaderboardHref(inputType, "day")} locale={language} prefetch={false} className="text-sm underline">
          {t("viewLeaderboard")}
        </Link>
      </div>
    );
  }

  if (ranking.kind === "would_rank") {
    return (
      <div data-testid="rank-summary" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-medium">{t("wouldRank", { rank: ranking.ranks.day })}</p>
        <Link
          data-testid="save-game"
          href={{ pathname: "/save/[gameId]", params: { gameId } }}
          className="rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400"
        >
          {t("saveIt")}
        </Link>
        <p className="w-full text-sm text-zinc-500 dark:text-zinc-400">{t("saveHint")}</p>
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
