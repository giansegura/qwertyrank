import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { flagPrefix } from "@/lib/countries";
import type { GameResult } from "@/lib/game/result";
import { leaderboardHref } from "@/lib/leaderboard/slugs";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";

/**
 * El resultado de una partida (spec 5d §3.2). Sin dependencias de servidor: lo pinta la página y, si el
 * jugador tiene una sanción, su propia 404 en el navegador (spec 5d §5).
 */
export function ResultCard({ result }: { result: GameResult }) {
  const t = useTranslations("Share");
  const tp = useTranslations("Profile");
  const format = useFormatter();

  return (
    <article data-testid="game-result" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-baseline gap-2">
          <span className="font-mono text-6xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {displayWpm(result.wpm)}
          </span>{" "}
          <span className="text-2xl font-semibold">{t("wpm")}</span>
        </h1>
        <p className="text-lg">{t("accuracy", { accuracy: displayAccuracy(result.accuracy) })}</p>
        <p className="text-zinc-600 dark:text-zinc-400">
          {tp("board", { language: result.language, input: result.inputType })}
        </p>
      </div>

      <p className="flex flex-wrap gap-x-2 text-sm text-zinc-600 dark:text-zinc-400">
        {result.player ? (
          <Link
            href={{ pathname: "/u/[nick]", params: { nick: result.player.nick } }}
            className="font-medium text-zinc-900 underline dark:text-zinc-100"
          >
            {flagPrefix(result.player.country)}
            {result.player.nick}
          </Link>
        ) : (
          <span>{t("anonymous")}</span>
        )}
        <span aria-hidden="true">·</span>
        <span>{t("playedOn", { date: format.dateTime(result.startsAt, { dateStyle: "long" }) })}</span>
      </p>

      {/* Se compite en el mismo test: el del idioma de la partida, aunque la página esté en otro. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="w-full font-medium">{t("challenge")}</p>
        <Link
          href="/"
          locale={result.language}
          className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400"
        >
          {t("takeTest")}
        </Link>
        <Link href={leaderboardHref(result.inputType)} locale={result.language} prefetch={false} className="text-sm underline">
          {t("viewLeaderboard")}
        </Link>
      </div>
    </article>
  );
}
