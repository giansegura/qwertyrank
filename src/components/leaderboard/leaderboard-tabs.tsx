import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { InputType } from "@/lib/game/types";
import { VISIBLE_PERIODS, type VisiblePeriod } from "@/lib/leaderboard/periods";
import { INPUT_TYPES, leaderboardHref } from "@/lib/leaderboard/slugs";

const TAB =
  "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 aria-[current]:bg-zinc-200 aria-[current]:text-zinc-950 dark:text-zinc-400 dark:aria-[current]:bg-zinc-800 dark:aria-[current]:text-zinc-50";

/** Filtros del ranking (spec §5.1): teclado y periodo. El idioma es el de la página (selector de idioma). */
export function LeaderboardTabs({ input, period }: { input: InputType; period: VisiblePeriod }) {
  const t = useTranslations("Leaderboard");
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label={t("inputLabel")} className="flex flex-wrap gap-1">
        {INPUT_TYPES.map((option) => (
          <Link
            key={option}
            href={leaderboardHref(option, period)}
            aria-current={option === input ? "page" : undefined}
            className={TAB}
          >
            {t("input", { input: option })}
          </Link>
        ))}
      </nav>
      <nav aria-label={t("periodLabel")} className="flex flex-wrap gap-1">
        {VISIBLE_PERIODS.map((option) => (
          <Link
            key={option}
            href={leaderboardHref(input, option)}
            aria-current={option === period ? "page" : undefined}
            className={TAB}
          >
            {t("period", { period: option })}
          </Link>
        ))}
      </nav>
    </div>
  );
}
