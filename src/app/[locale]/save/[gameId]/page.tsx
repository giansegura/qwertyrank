import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { SaveGame } from "@/components/ranked/save-game";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { loginPath } from "@/lib/auth-paths";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { robots: { index: false } };

interface SavePageProps {
  params: Promise<{ locale: string; gameId: string }>;
}

export default async function SavePage({ params }: SavePageProps) {
  const { locale, gameId } = await params;
  if (!hasLocale(routing.locales, locale) || !z.uuid().safeParse(gameId).success) notFound();
  const user = await getSessionUser(await headers());
  // Sin sesión: a entrar (o crear la cuenta) y de vuelta aquí, todavía dentro de los 10 minutos.
  if (!user) {
    redirect(loginPath(locale, getPathname({ locale, href: { pathname: "/save/[gameId]", params: { gameId } } })));
  }

  const t = await getTranslations("Save");
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <SaveGame gameId={gameId} />
    </>
  );
}
