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
    <table data-testid="leaderboard" className="w-full table-fixed border-collapse">
      <thead>
        <tr className="border-b border-zinc-300 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <th scope="col" className="w-10 py-2 font-medium">
            {t("column.rank")}
          </th>
          <th scope="col" className="py-2 font-medium">
            {t("column.player")}
          </th>
          <th scope="col" className="w-16 py-2 pl-3 text-right font-medium">
            {t("column.wpm")}
          </th>
          <th scope="col" className="w-24 py-2 pl-3 text-right font-medium">
            {t("column.accuracy")}
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.nick}
            data-testid="leaderboard-row"
            data-nick={entry.nick}
            className="border-b border-zinc-200 dark:border-zinc-800"
          >
            <td className="py-2 font-mono text-zinc-500 tabular-nums dark:text-zinc-400">{entry.rank}</td>
            <td className="truncate py-2">
              {/* No prefetch: it would be up to 100 profiles regenerating on every visit (Vercel Hobby limit). */}
              <Link
                href={{ pathname: "/u/[nick]", params: { nick: entry.nick } }}
                prefetch={false}
                className="font-medium"
              >
                {flagPrefix(entry.country)}
                {entry.nick}
              </Link>
            </td>
            <td className="py-2 pl-3 text-right font-mono tabular-nums">{displayWpm(entry.wpm)}</td>
            <td className="py-2 pl-3 text-right font-mono text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
              {t("accuracyValue", { accuracy: displayAccuracy(entry.accuracy) })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
