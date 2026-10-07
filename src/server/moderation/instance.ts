import "server-only";
import { revalidatePlayerPages } from "../cache";
import { getDb } from "../db/client";
import { serverEnv } from "../env";
import { getLeaderboardStore } from "../leaderboard/instance";
import { createNickAvailability } from "../profile/nick-reservation";
import { createRateLimiter } from "../rate-limit";
import { getRedis } from "../redis";
import { createReports, type CreateReport } from "./reports";
import { createSanctions, type Sanctions } from "./sanctions";

let sanctions: Sanctions | null = null;

export function getSanctions(): Sanctions {
  if (sanctions) return sanctions;
  const env = serverEnv();
  sanctions = createSanctions({
    db: getDb(),
    store: getLeaderboardStore(),
    onPlayerChanged: revalidatePlayerPages,
    identitySecret: env.IP_HASH_SECRET,
    isNickTaken: createNickAvailability(getDb(), getRedis(), env.REDIS_KEY_PREFIX),
  });
  return sanctions;
}

let report: CreateReport | null = null;

export function getReports(): CreateReport {
  report ??= createReports(getDb(), createRateLimiter(getRedis(), serverEnv().REDIS_KEY_PREFIX));
  return report;
}
