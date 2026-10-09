"use client";

import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { PendingVerification } from "@/lib/verification";
import type { VerificationGameProps } from "./verification-game";

type VerificationGameComponent = typeof import("./verification-game").VerificationGame;

/**
 * The verification game, instead of the screen it was chosen on (spec 4b §4.1, §4.3). Its module
 * (with the `canvas`) is downloaded with `import()` on mount: it does not weigh on the home page. While it arrives,
 * "Loading…"; if the download fails, `onUnavailable`.
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
 * The chosen verification game, on the same screen: after "Save it" or on `/verify`. If its module cannot
 * be downloaded, Ranked is unavailable.
 */
export function useVerificationModule() {
  const t = useTranslations("Ranked");
  const [chosen, setChosen] = useState<PendingVerification | "unavailable" | null>(null);

  /**
   * What is shown instead of the screen while verifying, or `null`. `onDone` and `doneLabel`, those of
   * the game (`VerificationGameProps`).
   */
  function view(onDone: VerificationGameProps["onDone"], doneLabel?: string): ReactNode {
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
    return (
      <LazyVerificationGame
        verification={chosen}
        doneLabel={doneLabel}
        onDone={onDone}
        onUnavailable={() => setChosen("unavailable")}
      />
    );
  }

  return {
    verify: (verification: PendingVerification) => setChosen(verification),
    view,
    close: () => setChosen(null),
  };
}
