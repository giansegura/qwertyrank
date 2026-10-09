import "server-only";
import { revalidatePath } from "next/cache";
import { leaderboardHref } from "@/lib/leaderboard/slugs";
import { getDb } from "../db/client";
import { serverEnv } from "../env";
import { getRedis } from "../redis";
import { createRanking, type Ranking } from "./ranking";
import { createLeaderboardStore, type LeaderboardStore } from "./store";

let store: LeaderboardStore | null = null;
let ranking: Ranking | null = null;

export function getLeaderboardStore(): LeaderboardStore {
  store ??= createLeaderboardStore(getRedis(), serverEnv().REDIS_KEY_PREFIX);
  return store;
}

export function getRanking(): Ranking {
  ranking ??= createRanking({
    db: getDb(),
    store: getLeaderboardStore(),
    // Each ranking is shown on the page of its test's language (spec §3.2). Its cache key is the
    // internal route with the language in front (/es/leaderboard/physical), not the public URL.
    onTopChanged: (boards) => {
      for (const { language, inputType } of boards) {
        revalidatePath(`/${language}${leaderboardHref(inputType)}`);
        // The home page shows the physical keyboard top 10 of its language (spec 5b §7).
        if (inputType === "physical") revalidatePath(`/${language}`);
      }
    },
  });
  return ranking;
}
