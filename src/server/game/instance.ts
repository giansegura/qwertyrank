import "server-only";
import { randomUUID } from "node:crypto";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import { loadWordList } from "@/lib/words/load";
import { getDb } from "../db/client";
import { serverEnv } from "../env";
import { getRanking } from "../leaderboard/instance";
import { createRateLimiter } from "../rate-limit";
import { getRedis } from "../redis";
import { createSaveVerificationGame } from "../verification/finish";
import { createClaimGame } from "./claim";
import { createSaveGame } from "./persist";
import { createGameService, type GameService } from "./service";
import { createStartGate, type StartGate } from "./start-gate";
import { createGameStore } from "./store";
import { createTurnstileVerifier } from "./turnstile";

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
    saveVerificationGame: createSaveVerificationGame(getDb()),
    loadWords: loadWordList,
    random: secureRandom,
    newId: randomUUID,
    times: RANKED_TIMES,
    rankGame: (game) => getRanking().rankGame(game),
  });
  return service;
}

let claim: ReturnType<typeof createClaimGame> | null = null;

export function claimGame(): ReturnType<typeof createClaimGame> {
  claim ??= createClaimGame({ db: getDb(), rankGame: (game) => getRanking().rankGame(game) });
  return claim;
}

let gate: StartGate | null = null;

export function startGate(): StartGate {
  if (gate) return gate;
  const env = serverEnv();
  gate = createStartGate({
    db: getDb(),
    limit: createRateLimiter(getRedis(), env.REDIS_KEY_PREFIX),
    verifyTurnstile: env.TURNSTILE_SECRET_KEY ? createTurnstileVerifier(env.TURNSTILE_SECRET_KEY) : null,
    passSecret: env.ANON_COOKIE_SECRET,
    ipSecret: env.IP_HASH_SECRET,
  });
  return gate;
}
