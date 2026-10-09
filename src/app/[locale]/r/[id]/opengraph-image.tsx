import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db/client";
import { getPublicResult } from "@/server/game/result";

/**
 * Image of a game when sharing it (spec 5d §4). The number comes from the database: nobody can make an
 * image with a fake score on our domain (spec §3.8). The page names it by hand with its `alt`; the one
 * here is the generic one.
 */
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Like the page: if the game stops being public, so does the image, within a minute at most. */
export const revalidate = 60;

/** Nothing at build time: each image is generated on its first request and stays cached (ISR), like the page. */
export function generateStaticParams() {
  return [];
}

export default async function ResultImage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: param, id } = await params;
  const locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;
  const result = await getPublicResult(getDb(), id);
  if (!result) notFound();
  const t = await getTranslations({ locale, namespace: "Share" });
  const tp = await getTranslations({ locale, namespace: "Profile" });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
          padding: 96,
          background: "#0a0a0a",
          color: "#ededed",
        }}
      >
        <div style={{ fontSize: 48, color: "#a1a1aa" }}>{SITE_NAME}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <span style={{ fontSize: 220, lineHeight: 1, color: "#fbbf24", letterSpacing: -4 }}>{displayWpm(result.wpm)}</span>
          <span style={{ fontSize: 72 }}>{t("wpm")}</span>
        </div>
        <div style={{ fontSize: 44 }}>
          {`${t("accuracy", { accuracy: displayAccuracy(result.accuracy) })} · ${tp("board", { language: result.language, input: result.inputType })}`}
        </div>
        {/* No flag: emojis would force downloading their images when generating it. */}
        <div style={{ fontSize: 40, color: "#a1a1aa" }}>{result.player?.nick ?? t("anonymous")}</div>
      </div>
    ),
    size,
  );
}
