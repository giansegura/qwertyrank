"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Cada cuánto se pide la página al acabar el periodo: con ISR, la del nuevo puede tardar hasta 60 s. */
const REFRESH_MS = 15_000;

/** Tiempo que falta, redondeado hacia arriba al minuto: días y horas, horas y minutos, o minutos. */
export function splitRemaining(ms: number) {
  const total = Math.max(1, Math.ceil(ms / 60_000));
  const days = Math.floor(total / 1_440);
  const hours = Math.floor((total % 1_440) / 60);
  const minutes = total % 60;
  const unit = days > 0 ? "days" : hours > 0 ? "hours" : "minutes";
  return { unit, days, hours, minutes };
}

/**
 * Cuenta atrás hasta `endsAt`, el final del periodo que enseña la página (spec §5.1); `null` en "siempre".
 * Se calcula solo en el navegador, después de montar: con la hora del servidor el HTML no coincidiría al
 * hidratar. Al llegar a 0, pide la página hasta que llega la del periodo nuevo.
 */
export function PeriodCountdown({ endsAt }: { endsAt: number | null }) {
  const t = useTranslations("Leaderboard");
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const ended = endsAt !== null && now !== null && now >= endsAt;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  useEffect(() => {
    if (!ended) return;
    router.refresh();
    const every = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(every);
  }, [ended, router]);

  if (endsAt === null) return null;
  return (
    <span data-testid="period-countdown" className="min-h-5 text-zinc-500 tabular-nums">
      {now === null ? " " : ended ? t("resetting") : t("resetsIn", splitRemaining(endsAt - now))}
    </span>
  );
}
