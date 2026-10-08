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
 * Antes de los E2E:
 * - se borran los límites de partidas (spec 4a §2): todos los tests salen de la misma máquina y varias
 *   ejecuciones seguidas agotarían los 150 inicios por hora de una IP;
 * - se borran las cuentas de pruebas anteriores (email `@example.com`: las de `uniqueEmail` y las de
 *   `seedPlayer`), con sus marcas y sus partidas, y se sacan de los rankings de Redis. Los rankings no se
 *   vacían nunca: sin esto, sus marcas acabarían quitándole el top 10 a la prueba de la verificación.
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
    // Como `deleteAccount`: primero sus marcas, que referencian sus partidas sin cascada.
    await sql`delete from bests where user_id in ${sql(ids)}`;
    await sql`delete from games where user_id in ${sql(ids)}`;
    await sql`delete from users where id in ${sql(ids)}`;
  } finally {
    await sql.end();
  }
}
