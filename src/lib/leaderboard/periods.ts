/** Periodos de los rankings (spec §5.1–5.3). Todo en UTC; las semanas son ISO (de lunes a domingo). */

export const PERIODS = ["day", "week", "month", "year", "all"] as const;
export type Period = (typeof PERIODS)[number];

/** "Año" se guarda desde el día 1, pero su pestaña se activa el 1 de enero siguiente al lanzamiento (spec §2). */
export const VISIBLE_PERIODS = ["day", "week", "month", "all"] as const;
export type VisiblePeriod = (typeof VISIBLE_PERIODS)[number];

const DAY_MS = 86_400_000;

/** Año y número de semana ISO: los del jueves de esa semana. */
export function isoWeek(date: Date): { year: number; week: number } {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return { year, week };
}

/** Clave del periodo que contiene `date`: `2026-10-04`, `2026-W40`, `2026-10`, `2026` o `all`. */
export function periodKey(period: Period, date: Date): string {
  const iso = date.toISOString();
  switch (period) {
    case "day":
      return iso.slice(0, 10);
    case "week": {
      const { year, week } = isoWeek(date);
      return `${year}-W${String(week).padStart(2, "0")}`;
    }
    case "month":
      return iso.slice(0, 7);
    case "year":
      return iso.slice(0, 4);
    case "all":
      return "all";
  }
}

export function periodKeys(date: Date): Record<Period, string> {
  return Object.fromEntries(PERIODS.map((period) => [period, periodKey(period, date)])) as Record<Period, string>;
}

/** Inicio del periodo que contiene `date`; `null` para "siempre". */
export function periodStart(period: Period, date: Date): Date | null {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  switch (period) {
    case "day":
      return new Date(Date.UTC(year, month, day));
    case "week":
      return new Date(Date.UTC(year, month, day - ((date.getUTCDay() || 7) - 1)));
    case "month":
      return new Date(Date.UTC(year, month, 1));
    case "year":
      return new Date(Date.UTC(year, 0, 1));
    case "all":
      return null;
  }
}

/** Momento en que se reinicia el periodo que contiene `date` (cuenta atrás, spec §5.1); `null` para "siempre". */
export function periodEnd(period: Period, date: Date): Date | null {
  const start = periodStart(period, date);
  if (!start) return null;
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  switch (period) {
    case "day":
      return new Date(Date.UTC(year, month, day + 1));
    case "week":
      return new Date(Date.UTC(year, month, day + 7));
    case "month":
      return new Date(Date.UTC(year, month + 1, 1));
    case "year":
      return new Date(Date.UTC(year + 1, 0, 1));
    case "all":
      return null;
  }
}
