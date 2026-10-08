import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VercelInsights } from "@/components/vercel-insights";
import { routing } from "@/i18n/routing";
import { INDEXABLE, SITE_NAME, SITE_URL } from "@/lib/site";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<LayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    // Las URLs de canonical, `hreflang` y Open Graph son siempre las de producción (spec 5b §2).
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · ${SITE_NAME}` },
    description: t("description"),
    // Durante la beta no se indexa (spec 5a §5).
    robots: INDEXABLE ? undefined : { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">{children}</main>
          <SiteFooter />
          <VercelInsights enabled={process.env.VERCEL_ENV === "production"} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
