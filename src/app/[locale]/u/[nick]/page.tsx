import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { flagPrefix } from "@/lib/countries";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";
import { getDb } from "@/server/db/client";
import { getPublicProfile } from "@/server/profile/public";

/** Como el ranking: se regenera cada 60 s y no se genera nada en el build. */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

interface ProfilePageProps {
  params: Promise<{ locale: string; nick: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { nick } = await params;
  // Perfiles sin indexar en la v1 (spec §7.1).
  return { title: `${nick} · QwertyRank`, robots: { index: false } };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale, nick } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const profile = await getPublicProfile(getDb(), nick);
  if (!profile) notFound();
  if (profile.nick !== nick) {
    redirect({ href: { pathname: "/u/[nick]", params: { nick: profile.nick } }, locale });
  }

  const t = await getTranslations("Profile");
  const format = await getFormatter();

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
                <span className="font-mono tabular-nums">
                  {t("score", { wpm: displayWpm(record.wpm), accuracy: displayAccuracy(record.accuracy) })}
                </span>
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
                key={game.startsAt.toISOString()}
                className="flex flex-wrap justify-between gap-x-4 border-b border-zinc-200 py-2 text-sm dark:border-zinc-800"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {format.dateTime(game.startsAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <span>{t("board", { language: game.language, input: game.inputType })}</span>
                <span className="font-mono tabular-nums">
                  {t("score", { wpm: displayWpm(game.wpm), accuracy: displayAccuracy(game.accuracy) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
