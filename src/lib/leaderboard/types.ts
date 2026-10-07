import type { PendingVerification } from "../verification";
import type { VisiblePeriod } from "./periods";

/**
 * Posición en cada ranking visible que sigue abierto (spec §3.4: "posición en cada periodo"). 1 = el mejor.
 * Una partida empezada antes de medianoche y terminada después no tiene la de "hoy": su día ya ha acabado.
 */
export type PeriodRanks = Partial<Record<VisiblePeriod, number>> & { all: number };

/**
 * El ranking de una partida, al terminarla o al reclamarla:
 * - `ranked`: con cuenta; `improved` son los periodos en que mejora su marca;
 * - `would_rank`: anónima; la posición que tendría, sin escribir en el ranking (spec §5.6);
 * - `low_accuracy`: válida, pero con menos del 90 % de precisión;
 * - `unranked`: partida no válida;
 * - `unavailable`: no se pudo calcular (Redis caído), aunque la partida sí está guardada; `canSave` si es
 *   anónima y se puede guardar en una cuenta;
 * - `review`: entraría en un top 10 y espera su verificación (spec 4b §2.4); `ranks`, la posición que
 *   tendría en cada ranking abierto, contada en PostgreSQL.
 */
export type GameRanking =
  | { kind: "ranked"; ranks: PeriodRanks; improved: VisiblePeriod[] }
  | { kind: "review"; ranks: PeriodRanks; verification: PendingVerification }
  | { kind: "would_rank"; ranks: PeriodRanks }
  | { kind: "low_accuracy" }
  | { kind: "unranked" }
  | { kind: "unavailable"; canSave: boolean };

/** Una fila del top de un ranking. */
export interface TopEntry {
  rank: number;
  nick: string;
  country: string | null;
  wpm: number;
  accuracy: number;
}

/** `GET /api/leaderboard/me`: la posición del jugador en un ranking, o `null` si no tiene marca. */
export type MyPositionResponse = { rank: number; wpm: number; accuracy: number } | { rank: null };
