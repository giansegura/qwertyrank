"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { periodEnd, type VisiblePeriod } from "@/lib/leaderboard/periods";

/** Tiempo que falta, redondeado hacia arriba al minuto: "2 d 5 h", "3 h 12 min" o "4 min". */
export function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${rest} min`;
  return `${rest} min`;
}

/**
 * Cuenta atrás hasta el cierre del periodo (spec §5.1). Se calcula solo en el navegador, después
 * de montar: con la hora del servidor el HTML no coincidiría al hidratar.
 */
export function PeriodCountdown({ period }: { period: VisiblePeriod }) {
  const t = useTranslations("Leaderboard");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  if (period === "all") return null;
  const end = now === null ? null : periodEnd(period, new Date(now));
  return (
    <span data-testid="period-countdown" className="min-h-5 text-zinc-500 tabular-nums">
      {end && now !== null ? t("resetsIn", { time: formatRemaining(end.getTime() - now) }) : " "}
    </span>
  );
}
