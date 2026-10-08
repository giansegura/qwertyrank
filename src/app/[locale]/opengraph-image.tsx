import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";
import { routing } from "@/i18n/routing";
import { SITE_NAME } from "@/lib/site";

/**
 * Imagen por defecto al compartir cualquier página (spec 5b §6); la de cada partida es de la 5d. Las páginas
 * con `pageMetadata` la nombran a mano (`/{locale}/opengraph-image`): mismo tamaño y `alt` que aquí.
 */
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Una imagen por idioma, generada en el build. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: param } = await params;
  const locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Home" });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 32,
          padding: 96,
          background: "#0a0a0a",
          color: "#ededed",
        }}
      >
        <div style={{ fontSize: 112, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 56, color: "#a1a1aa" }}>{t("title")}</div>
        <div style={{ display: "flex", gap: 24, fontSize: 36, color: "#fbbf24" }}>
          <span>30 s</span>
          <span>·</span>
          <span>en · es · pt</span>
        </div>
      </div>
    ),
    size,
  );
}
