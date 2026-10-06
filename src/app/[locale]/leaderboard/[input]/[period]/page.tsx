import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";
import { MyPosition } from "@/components/leaderboard/my-position";
import { PeriodCountdown } from "@/components/leaderboard/period-countdown";
import { routing } from "@/i18n/routing";
import { parseBoardParams } from "@/lib/leaderboard/slugs";
import { getDb } from "@/server/db/client";
import { currentBoard } from "@/server/leaderboard/store";
import { getTop } from "@/server/leaderboard/top";

/** El top se regenera cada 60 s (spec §5.6) y al momento cuando alguien entra en él (`revalidatePath`). */
export const revalidate = 60;

/** Ninguna página en el build (necesitaría la base de datos): se generan en la primera visita. */
export function generateStaticParams() {
  return [];
}

interface LeaderboardPageProps {
  params: Promise<{ locale: string; input: string; period: string }>;
}

export async function generateMetadata({ params }: LeaderboardPageProps): Promise<Metadata> {
  const { locale, input, period } = await params;
  const board = parseBoardParams(input, period);
  if (!hasLocale(routing.locales, locale) || !board) return {};
  const t = await getTranslations({ locale, namespace: "Leaderboard" });
  return { title: t("metaTitle", { language: locale, input: board.input, period: board.period }) };
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { locale, input: inputParam, period: periodParam } = await params;
  // Los parámetros son siempre los internos (/es/ranking/fisico/hoy llega como physical/today).
  const board = parseBoardParams(inputParam, periodParam);
  if (!hasLocale(routing.locales, locale) || !board) notFound();
  const { input, period } = board;

  const t = await getTranslations("Leaderboard");
  const entries = await getTop(getDb(), currentBoard(locale, input, period));

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title", { language: locale })}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("rule")}</p>
      </div>
      <LeaderboardTabs input={input} period={period} />
      {/* En móvil, una línea reservada para cada uno: si compartieran fila, al llegar se partiría en dos (CLS). */}
      <div className="flex flex-col gap-1 text-sm sm:min-h-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
        <MyPosition key={`${input}-${period}`} language={locale} input={input} period={period} />
        <PeriodCountdown period={period} />
      </div>
      <LeaderboardTable entries={entries} />
    </>
  );
}
