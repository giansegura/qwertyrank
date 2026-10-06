import "server-only";
import type { Redis } from "@upstash/redis";
import type { Db } from "../db/client";
import { liveBests } from "./live";
import { boardExpiresAt, boardKey, type BoardScore } from "./store";

export interface RebuildReport {
  /** Rankings que se escriben. */
  boards: number;
  /** Marcas que se escriben. */
  entries: number;
  /** Claves `lb:*` que se borran: sin marcas vivas, o temporales de una ejecución interrumpida. */
  removed: number;
}

const BATCH = 500;

async function scanKeys(redis: Redis, match: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, { match, count: 1_000 });
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== "0");
  return keys;
}

/**
 * Rehace los rankings de Redis desde PostgreSQL (spec 4a §6.1). Sin `write`, solo cuenta. Cada ranking
 * se escribe en `<clave>:rebuild` y se renombra sobre el bueno: ninguno queda vacío a medias. Una
 * partida que termine durante la reconstrucción puede perderse en Redis hasta la siguiente del jugador
 * (el autorreparado de `rankGame` la recupera).
 */
export async function rebuildLeaderboards(
  db: Db,
  redis: Redis,
  prefix: string,
  { write, now = new Date() }: { write: boolean; now?: Date },
): Promise<RebuildReport> {
  const bests = await liveBests(db, now);
  const byKey = new Map<string, BoardScore[]>();
  for (const best of bests) {
    const key = boardKey(prefix, best.board);
    byKey.set(key, [...(byKey.get(key) ?? []), best]);
  }
  const stale = (await scanKeys(redis, `${prefix}lb:*`)).filter((key) => !byKey.has(key));

  if (write) {
    for (const [key, entries] of byKey) {
      const temp = `${key}:rebuild`;
      const pipeline = redis.pipeline();
      pipeline.del(temp);
      for (let start = 0; start < entries.length; start += BATCH) {
        const [first, ...rest] = entries
          .slice(start, start + BATCH)
          .map((entry) => ({ score: entry.score, member: entry.userId }));
        pipeline.zadd(temp, first, ...rest);
      }
      const expiresAt = boardExpiresAt(entries[0].board.period, entries[0].achievedAt);
      if (expiresAt) pipeline.expireat(temp, expiresAt);
      pipeline.rename(temp, key);
      await pipeline.exec();
    }
    for (let start = 0; start < stale.length; start += BATCH) {
      await redis.del(...stale.slice(start, start + BATCH));
    }
  }

  return { boards: byKey.size, entries: bests.length, removed: stale.length };
}
