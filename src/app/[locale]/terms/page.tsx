import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LegalArticle } from "@/components/legal/legal-article";
import { TermsEn } from "@/components/legal/terms-en";
import { TermsEs } from "@/components/legal/terms-es";
import { TermsPt } from "@/components/legal/terms-pt";
import { routing } from "@/i18n/routing";

const CONTENT = { en: TermsEn, es: TermsEs, pt: TermsPt };

interface LegalPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: t("termsTitle") };
}

export default async function TermsPage({ params }: LegalPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const Content = CONTENT[locale];
  return (
    <LegalArticle>
      <Content />
    </LegalArticle>
  );
}
