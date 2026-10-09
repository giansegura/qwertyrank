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

/** The top is regenerated every 60 s (spec §5.6) and right away when someone enters it (`revalidatePath`). */
export const revalidate = 60;

/** No pages at build time (it would need the database): they are generated on the first visit. */
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
  // The parameter is always the internal one (/es/ranking/fisico arrives as physical).
  const input = parseInput(inputParam);
  if (!hasLocale(routing.locales, locale) || !input) notFound();

  const t = await getTranslations("Leaderboard");
  // The ranking is the one for tests in the page's language (spec §3.2).
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
