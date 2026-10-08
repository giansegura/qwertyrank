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
    // Cada ranking se ve en la página del idioma de su test (spec §3.2). La clave de su caché es la
    // ruta interna con el idioma delante (/es/leaderboard/physical), no la URL pública.
    onTopChanged: (boards) => {
      for (const { language, inputType } of boards) {
        revalidatePath(`/${language}${leaderboardHref(inputType)}`);
        // La portada enseña el top 10 del teclado físico de su idioma (spec 5b §7).
        if (inputType === "physical") revalidatePath(`/${language}`);
      }
    },
  });
  return ranking;
}
