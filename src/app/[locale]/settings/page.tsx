import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AccountActions } from "@/components/account/account-actions";
import { PasskeyList } from "@/components/account/passkey-list";
import { ProfileForm } from "@/components/account/profile-form";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { firstParam, loginPath, safeNext } from "@/lib/auth-paths";
import { countryOptions, isCountryCode } from "@/lib/countries";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { robots: { index: false } };

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const user = await getSessionUser(await headers());
  if (!user) redirect(loginPath(locale, getPathname({ locale, href: "/settings" })));

  const t = await getTranslations("Settings");
  // Bienvenida: justo después de crear la cuenta (spec §3.6). Solo el perfil y un botón para seguir.
  const welcome = firstParam(query.welcome) === "1";

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{welcome ? t("welcomeTitle") : t("title")}</h1>
        {welcome && <p className="text-zinc-600 dark:text-zinc-400">{t("welcomeIntro")}</p>}
      </div>
      <ProfileForm
        countries={countryOptions(locale)}
        initialNick={user.nick}
        initialCountry={user.country && isCountryCode(user.country) ? user.country : null}
        continueTo={welcome ? safeNext(locale, firstParam(query.next)) : null}
      />
      {!welcome && (
        <>
          <PasskeyList locale={locale} />
          <AccountActions locale={locale} />
        </>
      )}
    </>
  );
}
