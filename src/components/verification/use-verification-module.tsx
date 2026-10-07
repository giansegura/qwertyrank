"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { PendingVerification } from "@/lib/verification";

type VerificationGameComponent = typeof import("./verification-game").VerificationGame;

/**
 * La partida de verificación elegida, en la misma pantalla (spec 4b §4.1, §4.3): tras «Guárdalo» o en
 * `/verify`. Su módulo (con el `canvas`) se descarga con `import()` al elegirla; si la descarga falla,
 * Ranked no está disponible. RankedTest tiene su propia copia: con este hook, el JS de la portada pasaría
 * de los 30 KB (+131 B).
 */
export function useVerificationModule() {
  const t = useTranslations("Ranked");
  const [chosen, setChosen] = useState<PendingVerification | "unavailable" | null>(null);
  const [VerificationGame, setVerificationGame] = useState<VerificationGameComponent | null>(null);

  function verify(verification: PendingVerification) {
    setChosen(verification);
    if (!VerificationGame) {
      import("./verification-game").then(
        (module) => setVerificationGame(() => module.VerificationGame),
        () => setChosen("unavailable"),
      );
    }
  }

  /**
   * Lo que se enseña en lugar de la pantalla mientras se verifica, o `null`. `onDone`, al acabar la partida
   * (`gone`: la verificación ya no existía).
   */
  function view(onDone: (gone: boolean) => void): ReactNode {
    if (chosen === "unavailable") {
      return (
        <p role="alert" className="max-w-md">
          {t("unavailable")}{" "}
          <Link href="/practice" className="font-medium underline">
            {t("practiceLink")}
          </Link>
        </p>
      );
    }
    if (!chosen) return null;
    return VerificationGame ? (
      <VerificationGame verification={chosen} onDone={onDone} />
    ) : (
      <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
        {t("verifyLoading")}
      </p>
    );
  }

  return { verify, view, close: () => setChosen(null) };
}
