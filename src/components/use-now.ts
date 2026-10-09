"use client";

import { useEffect, useState } from "react";

/**
 * The current time, updated every `intervalMs`. `null` until after mount: with the server's time
 * the HTML would not match on hydration, and the React Compiler does not allow reading it during render.
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
