import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { flagPrefix } from "@/lib/countries";
import type { PublicProfile } from "@/lib/profile";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";

/**
 * El perfil de un jugador (spec §3.6). Sin dependencias de servidor: lo pinta la página y, si el
 * jugador tiene una sanción, su propia 404 en el navegador (spec 4a §6.2).
 */
export function ProfileView({ profile, actions }: { profile: PublicProfile; actions?: ReactNode }) {
  const t = useTranslations("Profile");
  const format = useFormatter();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {flagPrefix(profile.country)}
          {profile.nick}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("memberSince", { date: format.dateTime(profile.memberSince, { dateStyle: "long" }) })}
        </p>
        {actions}
      </div>

      <section aria-labelledby="records-title" className="flex flex-col gap-2">
        <h2 id="records-title" className="text-lg font-semibold">
          {t("records")}
        </h2>
        {profile.records.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("noRecords")}</p>
        ) : (
          <ul data-testid="profile-records" className="flex flex-col">
            {profile.records.map((record) => (
              <li
                key={`${record.language}-${record.inputType}`}
                className="flex flex-wrap justify-between gap-x-4 border-b border-zinc-200 py-2 dark:border-zinc-800"
              >
                <span>{t("board", { language: record.language, input: record.inputType })}</span>
                <Link
                  href={{ pathname: "/r/[id]", params: { id: record.gameId } }}
                  prefetch={false}
                  className="font-mono tabular-nums underline-offset-4 hover:underline"
                >
                  {t("score", { wpm: displayWpm(record.wpm), accuracy: displayAccuracy(record.accuracy) })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-title" className="flex flex-col gap-2">
        <h2 id="history-title" className="text-lg font-semibold">
          {t("history")}
        </h2>
        {profile.history.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t("noHistory")}</p>
        ) : (
          <ul data-testid="profile-history" className="flex flex-col">
            {profile.history.map((game) => (
              <li
                key={game.id}
                className="flex flex-wrap justify-between gap-x-4 border-b border-zinc-200 py-2 text-sm dark:border-zinc-800"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {format.dateTime(game.startsAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <span>{t("board", { language: game.language, input: game.inputType })}</span>
                <Link
                  href={{ pathname: "/r/[id]", params: { id: game.id } }}
                  prefetch={false}
                  className="font-mono tabular-nums underline-offset-4 hover:underline"
                >
                  {t("score", { wpm: displayWpm(game.wpm), accuracy: displayAccuracy(game.accuracy) })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
