import "server-only";
import { randomUUID } from "node:crypto";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import { loadWordList } from "@/lib/words/load";
import { getDb } from "../db/client";
import { serverEnv } from "../env";
import { getRedis } from "../redis";
import { createSaveGame } from "./persist";
import { createGameService, type GameService } from "./service";
import { createGameStore } from "./store";

/** Cuenta atrás de 3 s, 30 s de partida y 3 s de margen para la latencia (spec §3.4 y §4.2). */
export const RANKED_TIMES = { countdownMs: 3_000, durationMs: OFFICIAL_DURATION_MS, graceMs: 3_000 };

function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

let service: GameService | null = null;

export function gameService(): GameService {
  service ??= createGameService({
    store: createGameStore(getRedis(), serverEnv().REDIS_KEY_PREFIX),
    saveGame: createSaveGame(getDb()),
    loadWords: loadWordList,
    random: secureRandom,
    newId: randomUUID,
    times: RANKED_TIMES,
  });
  return service;
}
