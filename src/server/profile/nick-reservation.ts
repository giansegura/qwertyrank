import "server-only";
import type { Redis } from "@upstash/redis";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";

export const NICK_RESERVATION_SECONDS = 60;

/**
 * ¿Está cogido el nick? Sí si ya es de alguien o si otro registro lo acaba de reservar. Si está libre,
 * lo reserva 60 s (spec 4a §6.5): dos registros a la vez nunca eligen el mismo, y el índice único
 * sobre `lower(nick)` ya no salta.
 */
export function createNickAvailability(db: Db, redis: Redis, prefix: string) {
  return async function isNickTaken(nick: string): Promise<boolean> {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.nick}) = lower(${nick})`)
      .limit(1);
    if (rows.length > 0) return true;
    const reserved = await redis.set(`${prefix}nick-reserve:${nick.toLowerCase()}`, "1", {
      nx: true,
      ex: NICK_RESERVATION_SECONDS,
    });
    return reserved === null;
  };
}
