import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { GuideList } from "@/components/guides/guide-list";
import { JsonLd } from "@/components/seo/json-ld";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";

interface GuidesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: GuidesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Guides" });
  return pageMetadata({ locale, href: "/guides", title: t("indexTitle"), description: t("indexDescription") });
}

/** The guides index (spec 5c §4): every guide with its description. */
export default async function GuidesPage({ params }: GuidesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Guides");
  return (
    <div data-testid="guides-index" className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("indexTitle")}</h1>
      <p className="text-zinc-700 dark:text-zinc-300">{t("indexIntro")}</p>
      <GuideList />
      <JsonLd data={breadcrumbStructuredData(locale, "/guides", t("indexTitle"))} />
    </div>
  );
}
