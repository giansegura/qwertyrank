import "server-only";
import { Redis } from "@upstash/redis";
import { serverEnv } from "./env";

let redis: Redis | null = null;

export function createRedis(url: string, token: string): Redis {
  // No automatic deserialization: the scripts return text and we interpret it ourselves.
  return new Redis({ url, token, automaticDeserialization: false });
}

export function getRedis(): Redis {
  const env = serverEnv();
  redis ??= createRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  return redis;
}
