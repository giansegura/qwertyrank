import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { ResultCard } from "@/components/result/result-card";
import { routing } from "@/i18n/routing";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";
import { resultMetadata } from "@/lib/seo/metadata";
import { getDb } from "@/server/db/client";
import { getPublicResult } from "@/server/game/result";

/** Como el perfil: se regenera cada 60 s y no se genera nada en el build (spec 5d §3.1). */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

interface ResultPageProps {
  params: Promise<{ locale: string; id: string }>;
}

/** Una consulta por petición, compartida por los metadatos y la página. */
const readResult = cache((id: string) => getPublicResult(getDb(), id));

export async function generateMetadata({ params }: ResultPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const result = await readResult(id);
  if (!result) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: "Share" });
  const wpm = displayWpm(result.wpm);
  const accuracy = displayAccuracy(result.accuracy);
  const title = result.player
    ? t("metaTitle", { nick: result.player.nick, wpm, language: result.language })
    : t("metaTitleAnonymous", { wpm, language: result.language });
  return resultMetadata({
    locale,
    id,
    title,
    description: t("metaDescription", { accuracy }),
    imageAlt: t("imageAlt", { wpm, accuracy }),
  });
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const result = await readResult(id);
  if (!result) notFound();
  return <ResultCard result={result} />;
}
