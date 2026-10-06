import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { ReportButton } from "@/components/profile/report-button";
import { ProfileView } from "@/components/profile/profile-view";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getDb } from "@/server/db/client";
import { getPublicProfile } from "@/server/profile/public";

/** Como el ranking: se regenera cada 60 s y no se genera nada en el build. */
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

interface ProfilePageProps {
  params: Promise<{ locale: string; nick: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { nick } = await params;
  // Perfiles sin indexar en la v1 (spec §7.1).
  return { title: `${nick} · QwertyRank`, robots: { index: false } };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale, nick } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const profile = await getPublicProfile(getDb(), nick);
  if (!profile) notFound();
  if (profile.nick !== nick) {
    redirect({ href: { pathname: "/u/[nick]", params: { nick: profile.nick } }, locale });
  }

  return <ProfileView profile={profile} actions={<ReportButton nick={profile.nick} />} />;
}
