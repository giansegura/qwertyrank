import { useTranslations } from "next-intl";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Link } from "@/i18n/navigation";
import type { TopEntry } from "@/lib/leaderboard/types";

/** Physical keyboard top 10 on the home page (spec 5b §7), in the server HTML. */
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
