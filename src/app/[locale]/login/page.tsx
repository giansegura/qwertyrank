import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { firstParam, safeNext } from "@/lib/auth-paths";
import { serverEnv } from "@/server/env";

export const metadata: Metadata = { robots: { index: false } };

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const t = await getTranslations("Login");
  const env = serverEnv();

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>
      <LoginForm
        locale={locale}
        next={safeNext(locale, firstParam(query.next))}
        googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
        callbackError={firstParam(query.error) ?? null}
      />
      <p data-testid="login-consent" className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
        {t.rich("consent", {
          terms: (chunks) => (
            <Link href="/terms" className="underline">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/privacy" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
