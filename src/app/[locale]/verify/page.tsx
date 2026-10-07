import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { VerifyList } from "@/components/verification/verify-list";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { loginPath } from "@/lib/auth-paths";
import { getSessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { pendingVerifications } from "@/server/verification/pending";

export const metadata: Metadata = { robots: { index: false } };

/** Récords pendientes de verificar (spec 4b §4.3). Dinámica: depende de la sesión. */
export default async function VerifyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const user = await getSessionUser(await headers());
  // Sin sesión: a entrar y de vuelta aquí.
  if (!user) redirect(loginPath(locale, getPathname({ locale, href: "/verify" })));

  const [t, pending] = await Promise.all([getTranslations("Verification"), pendingVerifications(getDb(), user.id)]);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>
      <VerifyList pending={pending} />
    </>
  );
}
