import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { HomeAbout } from "@/components/home/home-about";
import { HomeTop } from "@/components/home/home-top";
import { RankedTest } from "@/components/ranked/ranked-test";
import { JsonLd } from "@/components/seo/json-ld";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo/metadata";
import { homeStructuredData } from "@/lib/seo/structured-data";
import { getDb } from "@/server/db/client";
import { readHomeTop } from "@/server/leaderboard/home-top";
import { getTop } from "@/server/leaderboard/top";

/** El top 10 se regenera cada 60 s, como el ranking, y al momento cuando cambia (spec 5b §7). */
export const revalidate = 60;

/** Filas del top de la portada. */
const HOME_TOP_SIZE = 10;

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return pageMetadata({ locale, href: "/", title: t("title"), description: t("description") });
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Home");
  const meta = await getTranslations("Metadata");
  const top = await readHomeTop(() => getTop(getDb(), { language: locale, inputType: "physical" }, HOME_TOP_SIZE));

  // El texto de Ranked no va en la página: lo envía el servidor al pulsar Empezar (spec §3.4).
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <RankedTest language={locale} />
      {top && <HomeTop entries={top} />}
      <HomeAbout />
      <JsonLd data={homeStructuredData(locale, meta("description"))} />
    </>
  );
}
