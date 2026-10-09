"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { type GameResult, type GameResultJson, isGameId, resultFromJson } from "@/lib/game/result";
import { getViewer } from "@/lib/viewer";
import { ResultCard } from "./result-card";

/**
 * Inside a result's 404 (spec 5d §5): with a session, asks whether the game is the player's (with a
 * shadow-ban or ban it is not public) and, if so, shows it to them. Everyone else gets the usual 404.
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
