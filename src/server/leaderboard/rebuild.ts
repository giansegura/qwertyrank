import "server-only";
import type { Redis } from "@upstash/redis";
import type { Db } from "../db/client";
import { activeBests } from "./live";
import { boardKey, type BoardScore } from "./store";

export interface RebuildReport {
  /** Rankings that are written. */
  boards: number;
  /** Bests that are written. */
  entries: number;
  /** `lb:*` keys that are deleted: without bests, from the old per-period rankings or temporary ones from an interrupted run. */
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
 * Rebuilds the Redis rankings from PostgreSQL (spec 4a §6.1). Without `write`, it only counts. Each ranking
 * is written to `<key>:rebuild` and renamed over the real one: none is left half-empty. A game that
 * finishes during the rebuild may be lost in Redis until the player's next one (the self-repair in
 * `rankGame` recovers it).
 */
export async function rebuildLeaderboards(
  db: Db,
  redis: Redis,
  prefix: string,
  { write }: { write: boolean },
): Promise<RebuildReport> {
  const bests = await activeBests(db);
  const byKey = new Map<string, BoardScore[]>();
  for (const best of bests) {
    const key = boardKey(prefix, best.board);
    const entries = byKey.get(key);
    if (entries) entries.push(best);
    else byKey.set(key, [best]);
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
      pipeline.rename(temp, key);
      await pipeline.exec();
    }
    for (let start = 0; start < stale.length; start += BATCH) {
      await redis.del(...stale.slice(start, start + BATCH));
    }
  }

  return { boards: byKey.size, entries: bests.length, removed: stale.length };
}
