"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { loginHref } from "@/lib/auth-paths";
import type { InputType } from "@/lib/game/types";
import type { MyPositionResponse } from "@/lib/leaderboard/types";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";
import { getViewer } from "@/lib/viewer";
import type { TestLanguage } from "@/lib/words/languages";

type State = { name: "loading" | "signed_out" | "error" } | { name: "loaded"; position: MyPositionResponse };

/** La página del ranking es la misma para todos (en caché 60 s): la posición propia se pide aparte, sin caché. */
export function MyPosition({ language, input }: { language: TestLanguage; input: InputType }) {
  const t = useTranslations("Leaderboard");
  const pathname = usePathname();
  const [state, setState] = useState<State>({ name: "loading" });

  useEffect(() => {
    let active = true;
    // Sin sesión no se pregunta por la posición: lo sabe ya la cabecera (una petición menos por visita).
    getViewer()
      .then(async (viewer): Promise<State> => {
        if (!viewer) return { name: "signed_out" };
        const response = await fetch(`/api/leaderboard/me?lang=${language}&input=${input}`, { cache: "no-store" });
        if (response.status === 401) return { name: "signed_out" };
        if (!response.ok) return { name: "error" };
        return { name: "loaded", position: (await response.json()) as MyPositionResponse };
      })
      .then(
        (next) => active && setState(next),
        () => active && setState({ name: "error" }),
      );
    return () => {
      active = false;
    };
  }, [language, input]);

  return (
    <p data-testid="my-position" className="min-h-5 text-sm font-medium">
      {state.name === "signed_out" && (
        <Link href={loginHref(pathname)} className="underline">
          {t("youSignIn")}
        </Link>
      )}
      {state.name === "loaded" &&
        (state.position.rank === null
          ? t("youNone")
          : t("you", {
              rank: state.position.rank,
              wpm: displayWpm(state.position.wpm),
              accuracy: displayAccuracy(state.position.accuracy),
            }))}
    </p>
  );
}
