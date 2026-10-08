import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LegalArticle } from "@/components/legal/legal-article";
import { PrivacyEn } from "@/components/legal/privacy-en";
import { PrivacyEs } from "@/components/legal/privacy-es";
import { PrivacyPt } from "@/components/legal/privacy-pt";
import { routing } from "@/i18n/routing";

const CONTENT = { en: PrivacyEn, es: PrivacyEs, pt: PrivacyPt };

interface LegalPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("privacyTitle") };
}

export default async function PrivacyPage({ params }: LegalPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const Content = CONTENT[locale];
  return (
    <LegalArticle>
      <Content />
    </LegalArticle>
  );
}
