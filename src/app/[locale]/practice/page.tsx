import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/seo/json-ld";
import { TypingTest } from "@/components/typing-test/typing-test";
import { routing } from "@/i18n/routing";
import { PRACTICE_DURATION_MS } from "@/lib/scoring/durations";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";
import { getInitialWords } from "@/lib/words/initial-words";

interface PracticePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PracticePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Practice" });
  return pageMetadata({ locale, href: "/practice", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function PracticePage({ params }: PracticePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Practice");
  const initialWords = await getInitialWords(locale);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>
      <TypingTest language={locale} durationMs={PRACTICE_DURATION_MS} initialWords={initialWords} />
      <JsonLd data={breadcrumbStructuredData(locale, "/practice", t("metaTitle"))} />
    </>
  );
}
