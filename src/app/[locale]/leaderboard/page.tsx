import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { userAgent } from "next/server";
import { hasLocale } from "next-intl";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { leaderboardHref } from "@/lib/leaderboard/slugs";

/** `/es/ranking`: el ranking del teclado del dispositivo (spec §5.1). */
export default async function LeaderboardIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { device } = userAgent({ headers: await headers() });
  const input = device.type === "mobile" || device.type === "tablet" ? "touch" : "physical";
  redirect({ href: leaderboardHref(input), locale });
}
