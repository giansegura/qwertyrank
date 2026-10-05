import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { RankedTest } from "@/components/ranked/ranked-test";
import { routing } from "@/i18n/routing";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Home");

  // El texto de Ranked no va en la página: lo envía el servidor al pulsar Empezar (spec §3.4).
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <RankedTest language={locale} />
      <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
    </>
  );
}
