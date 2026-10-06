import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { flagPrefix } from "@/lib/countries";
import type { TopEntry } from "@/lib/leaderboard/types";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";

export function LeaderboardTable({ entries }: { entries: TopEntry[] }) {
  const t = useTranslations("Leaderboard");

  if (entries.length === 0) {
    return (
      <p data-testid="leaderboard-empty" className="text-zinc-600 dark:text-zinc-400">
        {t("empty")}{" "}
        <Link href="/" className="font-medium underline">
          {t("play")}
        </Link>
      </p>
    );
  }

  return (
    <ol data-testid="leaderboard" className="flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.nick}
          data-testid="leaderboard-row"
          data-nick={entry.nick}
          className="grid grid-cols-[2.5rem_1fr_auto_3.5rem] items-center gap-3 border-b border-zinc-200 py-2 dark:border-zinc-800"
        >
          <span className="font-mono text-zinc-500 tabular-nums">{entry.rank}</span>
          {/* Sin precarga: serían hasta 100 perfiles regenerándose por cada visita (límite de Vercel Hobby). */}
          <Link
            href={{ pathname: "/u/[nick]", params: { nick: entry.nick } }}
            prefetch={false}
            className="truncate font-medium"
          >
            {flagPrefix(entry.country)}
            {entry.nick}
          </Link>
          <span className="font-mono tabular-nums">
            {displayWpm(entry.wpm)} <span className="text-xs text-zinc-500">{t("wpm")}</span>
          </span>
          <span className="text-right font-mono text-sm text-zinc-500 tabular-nums">{displayAccuracy(entry.accuracy)}%</span>
        </li>
      ))}
    </ol>
  );
}
