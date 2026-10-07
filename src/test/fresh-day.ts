import { randomInt } from "node:crypto";

/**
 * Un día que ninguna otra prueba usa: sus rankings de día, semana y mes empiezan vacíos, así que
 * cualquier partida de un jugador sin nivel verificado entra en su top 10. Pasado 2057 los minutos de
 * la puntuación ya no cuentan, así que lo que decide es la velocidad.
 */
export function freshDay(): Date {
  return new Date(Date.UTC(randomInt(2100, 9999), randomInt(0, 12), randomInt(1, 29), 12));
}
