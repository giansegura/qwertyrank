import type { PendingVerification } from "../verification";

/**
 * El ranking de una partida, al terminarla o al reclamarla, con su posición en el ranking de su idioma y
 * teclado (1 = el mejor):
 * - `ranked`: con cuenta; `improved` si es su nueva mejor marca;
 * - `would_rank`: anónima; la posición que tendría, sin escribir en el ranking (spec §5.6);
 * - `low_accuracy`: válida, pero con menos del 90 % de precisión;
 * - `unranked`: partida no válida;
 * - `unavailable`: no se pudo calcular (Redis caído), aunque la partida sí está guardada; `canSave` si es
 *   anónima y se puede guardar en una cuenta;
 * - `review`: entraría en un top 10 y espera su verificación (spec 4b §2.4); `rank`, la posición que
 *   tendría, contada en PostgreSQL.
 */
export type GameRanking =
  | { kind: "ranked"; rank: number; improved: boolean }
  | { kind: "review"; rank: number; verification: PendingVerification }
  | { kind: "would_rank"; rank: number }
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
