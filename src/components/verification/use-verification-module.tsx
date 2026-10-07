"use client";

import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { PendingVerification } from "@/lib/verification";
import type { VerificationGameProps } from "./verification-game";

type VerificationGameComponent = typeof import("./verification-game").VerificationGame;

/**
 * La partida de verificación, en lugar de la pantalla en la que se eligió (spec 4b §4.1, §4.3). Su módulo
 * (con el `canvas`) se descarga con `import()` al montarse: no pesa en la portada. Mientras llega,
 * "Cargando…"; si la descarga falla, `onUnavailable`.
 */
export function LazyVerificationGame({ onUnavailable, ...props }: VerificationGameProps & { onUnavailable: () => void }) {
  const t = useTranslations("Ranked");
  const [VerificationGame, setVerificationGame] = useState<VerificationGameComponent | null>(null);
  const unavailable = useEffectEvent(onUnavailable);

  useEffect(() => {
    let active = true;
    import("./verification-game").then(
      (module) => active && setVerificationGame(() => module.VerificationGame),
      () => active && unavailable(),
    );
    return () => {
      active = false;
    };
  }, []);

  return VerificationGame ? (
    <VerificationGame {...props} />
  ) : (
    <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
      {t("verifyLoading")}
    </p>
  );
}

/**
 * La partida de verificación elegida, en la misma pantalla: tras «Guárdalo» o en `/verify`. Si su módulo no
 * se puede descargar, Ranked no está disponible.
 */
export function useVerificationModule() {
  const t = useTranslations("Ranked");
  const [chosen, setChosen] = useState<PendingVerification | "unavailable" | null>(null);

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
    return <LazyVerificationGame verification={chosen} onDone={onDone} onUnavailable={() => setChosen("unavailable")} />;
  }

  return {
    verify: (verification: PendingVerification) => setChosen(verification),
    view,
    close: () => setChosen(null),
  };
}
