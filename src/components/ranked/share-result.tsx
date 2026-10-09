"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { displayWpm } from "@/lib/scoring/metrics";
import type { TestLanguage } from "@/lib/words/languages";

export interface ShareResultProps {
  gameId: string;
  /** Idioma del test, para el texto: «en portugués», aunque la página esté en español. */
  language: TestLanguage;
  wpm: number;
}

type ShareState = { kind: "idle" } | { kind: "copied" } | { kind: "manual"; url: string };

/** Cuánto dice el botón «¡Enlace copiado!». */
const COPIED_MS = 2_000;

/**
 * «Compartir» tras una partida Ranked válida (spec 5d §6): el menú del sistema si lo hay; si no, copia el
 * enlace; y si tampoco se puede, lo enseña. El enlace es de este dominio (también en las vistas previas).
 */
export function ShareResult({ gameId, language, wpm }: ShareResultProps) {
  const t = useTranslations("Share");
  const locale = useLocale() as Locale;
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const href = { pathname: "/r/[id]", params: { id: gameId } } as const;

  useEffect(() => {
    if (state.kind !== "copied") return;
    const timer = setTimeout(() => setState({ kind: "idle" }), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function share() {
    const url = new URL(getPathname({ locale, href }), window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, text: t("shareText", { wpm: displayWpm(wpm), language }) });
        return;
      } catch (error) {
        // El jugador ha cerrado el menú: no es un fallo.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState({ kind: "copied" });
    } catch {
      setState({ kind: "manual", url });
    }
  }

  return (
    <div data-testid="share-result" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        data-testid="share-button"
        onClick={() => void share()}
        className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {state.kind === "copied" ? t("copied") : t("share")}
      </button>
      <Link href={href} prefetch={false} className="text-sm underline">
        {t("viewResult")}
      </Link>
      {state.kind === "manual" && (
        <p className="w-full text-sm">
          {t("copyManually")}{" "}
          <a href={state.url} className="break-all underline">
            {state.url}
          </a>
        </p>
      )}
    </div>
  );
}
