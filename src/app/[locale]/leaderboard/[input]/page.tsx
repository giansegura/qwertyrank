import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";
import { MyPosition } from "@/components/leaderboard/my-position";
import { JsonLd } from "@/components/seo/json-ld";
import { routing } from "@/i18n/routing";
import { leaderboardHref, parseInput } from "@/lib/leaderboard/slugs";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";
import { getDb } from "@/server/db/client";
import { getTop } from "@/server/leaderboard/top";

/** El top se regenera cada 60 s (spec §5.6) y al momento cuando alguien entra en él (`revalidatePath`). */
export const revalidate = 60;

/** Ninguna página en el build (necesitaría la base de datos): se generan en la primera visita. */
export function generateStaticParams() {
  return [];
}

interface LeaderboardPageProps {
  params: Promise<{ locale: string; input: string }>;
}

export async function generateMetadata({ params }: LeaderboardPageProps): Promise<Metadata> {
  const { locale, input: inputParam } = await params;
  const input = parseInput(inputParam);
  if (!hasLocale(routing.locales, locale) || !input) return {};
  const t = await getTranslations({ locale, namespace: "Leaderboard" });
  return pageMetadata({
    locale,
    href: leaderboardHref(input),
    title: t("metaTitle", { language: locale, input }),
    description: t("metaDescription", { language: locale, input }),
  });
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { locale, input: inputParam } = await params;
  // El parámetro es siempre el interno (/es/ranking/fisico llega como physical).
  const input = parseInput(inputParam);
  if (!hasLocale(routing.locales, locale) || !input) notFound();

  const t = await getTranslations("Leaderboard");
  // El ranking es el de los tests en el idioma de la página (spec §3.2).
  const entries = await getTop(getDb(), { language: locale, inputType: input });

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title", { language: locale })}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("rule")}</p>
      </div>
      <LeaderboardTabs input={input} />
      <MyPosition key={input} language={locale} input={input} />
      <LeaderboardTable entries={entries} />
      <JsonLd data={breadcrumbStructuredData(locale, leaderboardHref(input), t("metaTitle", { language: locale, input }))} />
    </>
  );
}
