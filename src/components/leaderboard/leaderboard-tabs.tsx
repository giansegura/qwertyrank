import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { InputType } from "@/lib/game/types";
import { INPUT_TYPES, leaderboardHref } from "@/lib/leaderboard/slugs";

const TAB =
  "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 aria-[current]:bg-zinc-200 aria-[current]:text-zinc-950 dark:text-zinc-400 dark:aria-[current]:bg-zinc-800 dark:aria-[current]:text-zinc-50";

/** Filtro del ranking (spec §5.1): el teclado. El idioma es el de la página (selector de idioma). */
export function LeaderboardTabs({ input }: { input: InputType }) {
  const t = useTranslations("Leaderboard");
  return (
    <nav aria-label={t("inputLabel")} className="flex flex-wrap gap-1">
      {INPUT_TYPES.map((option) => (
        <Link
          key={option}
          href={leaderboardHref(option)}
          aria-current={option === input ? "page" : undefined}
          className={TAB}
        >
          {t("input", { input: option })}
        </Link>
      ))}
    </nav>
  );
}
