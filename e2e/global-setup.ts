import { loadEnvConfig } from "@next/env";
import { Redis } from "@upstash/redis";
import postgres from "postgres";

const BATCH = 500;

async function scanKeys(redis: Redis, match: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, { match, count: 500 });
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== "0");
  return keys;
}

/**
 * Before the E2E tests:
 * - the game limits are cleared (spec 4a §2): every test comes from the same machine and several
 *   runs in a row would use up an IP's 150 starts per hour;
 * - accounts from previous test runs (email `@example.com`: those from `uniqueEmail` and from
 *   `seedPlayer`) are deleted, with their records and games, and removed from the Redis rankings. The
 *   rankings are never emptied: without this, their records would end up taking the top 10 from the verification test.
 */
export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    automaticDeserialization: false,
  });
  const prefix = process.env.REDIS_KEY_PREFIX ?? "qr:";
  const limits = await scanKeys(redis, `${prefix}rl:*`);
  for (let start = 0; start < limits.length; start += BATCH) await redis.del(...limits.slice(start, start + BATCH));

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const ids = (await sql<{ id: string }[]>`select id from users where email like '%@example.com'`).map((row) => row.id);
    if (ids.length === 0) return;
    for (const key of await scanKeys(redis, `${prefix}lb:*`)) {
      for (let start = 0; start < ids.length; start += BATCH) await redis.zrem(key, ...ids.slice(start, start + BATCH));
    }
    // Like `deleteAccount`: first their bests, which reference their games without cascade.
    await sql`delete from bests where user_id in ${sql(ids)}`;
    await sql`delete from games where user_id in ${sql(ids)}`;
    await sql`delete from users where id in ${sql(ids)}`;
  } finally {
    await sql.end();
  }
}
