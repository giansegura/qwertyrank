import { loadEnvConfig } from "@next/env";
import { Redis } from "@upstash/redis";

/**
 * Antes de los E2E se borran los límites de partidas (spec 4a §2): todos los tests salen de la misma
 * máquina y varias ejecuciones seguidas agotarían los 150 inicios por hora de una IP.
 */
export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    automaticDeserialization: false,
  });
  const match = `${process.env.REDIS_KEY_PREFIX ?? "qr:"}rl:*`;
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match, count: 500 });
    if (keys.length > 0) await redis.del(...keys);
    cursor = String(next);
  } while (cursor !== "0");
}
