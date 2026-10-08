import { useTranslations } from "next-intl";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Link } from "@/i18n/navigation";
import type { TopEntry } from "@/lib/leaderboard/types";

/** Top 10 del teclado físico en la portada (spec 5b §7), en el HTML del servidor. */
export function HomeTop({ entries }: { entries: TopEntry[] }) {
  const t = useTranslations("Home");
  return (
    <section data-testid="home-top" aria-labelledby="home-top-title" className="flex flex-col gap-3">
      <h2 id="home-top-title" className="text-lg font-semibold">
        {t("topTitle")}
      </h2>
      <LeaderboardTable entries={entries} />
      {entries.length > 0 && (
        <Link href="/leaderboard/physical" className="text-sm font-medium underline">
          {t("topAll")}
        </Link>
      )}
    </section>
  );
}
