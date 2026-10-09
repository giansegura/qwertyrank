"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { type GameResult, type GameResultJson, isGameId, resultFromJson } from "@/lib/game/result";
import { getViewer } from "@/lib/viewer";
import { ResultCard } from "./result-card";

/**
 * Dentro de la 404 de un resultado (spec 5d §5): con sesión, pregunta si la partida es del jugador (con
 * shadow-ban o ban no es pública) y, si lo es, se la enseña. A los demás, la 404 de siempre.
 */
export function OwnResultFallback({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [result, setResult] = useState<GameResult | null>(null);

  useEffect(() => {
    const id = pathname?.split("/").at(-1) ?? "";
    if (!isGameId(id)) return;
    let active = true;
    void (async () => {
      if (!(await getViewer())) return;
      const response = await fetch(`/api/game/${id}/result`, { cache: "no-store" });
      if (active && response.ok) setResult(resultFromJson((await response.json()) as GameResultJson));
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  return result ? <ResultCard result={result} /> : children;
}
