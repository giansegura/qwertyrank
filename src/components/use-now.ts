"use client";

import { useEffect, useState } from "react";

/**
 * La hora actual, que se actualiza cada `intervalMs`. `null` hasta después de montar: con la hora del
 * servidor el HTML no coincidiría al hidratar, y el React Compiler no deja leerla durante el render.
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [intervalMs]);
  return now;
}
