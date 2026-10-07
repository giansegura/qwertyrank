import "server-only";
import type { FinishResponse, PublicReason, RejectReason, StartRequest, StartResponse } from "@/lib/game/types";
import { replay } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import { generateWords } from "@/lib/words/generate";
import { WORDS_PER_TEST, type TestLanguage } from "@/lib/words/languages";
import { classifyInputType } from "../anticheat/input-type";
import { checkEvents, checkSpeed, checkTiming, type ReceivedBatch } from "../anticheat/rules";
import type { GameRanking } from "@/lib/leaderboard/types";
import type { RankGameInput } from "../leaderboard/ranking";
import type { SaveGame, SavedGame } from "./persist";
import type { AppendStatus, GameStore, GameTimes } from "./store";

/** Categoría que se le enseña al jugador; el motivo exacto se queda en la base de datos. */
const PUBLIC_REASON: Record<RejectReason, PublicReason> = {
  late: "connection",
  incomplete: "connection",
  early_input: "unrecognized",
  fabricated_timing: "unrecognized",
  untrusted: "unrecognized",
  injected_input: "unrecognized",
  inhuman_burst: "unrecognized",
  inhuman_speed: "unrecognized",
  multi_insert: "letter_by_letter",
};

export interface GameServiceDeps {
  store: GameStore;
  saveGame: SaveGame;
  loadWords: (language: TestLanguage) => Promise<readonly string[]>;
  random: () => number;
  newId: () => string;
  times: GameTimes;
  /** Publica las marcas y calcula las posiciones (spec §5.5–5.6); no lanza. */
  rankGame: (game: RankGameInput) => Promise<GameRanking>;
}

export type FinishOutcome =
  | { kind: "ok"; response: FinishResponse }
  | { kind: "busy" | "closed" | "not_found" };

export interface GameService {
  start(input: StartRequest & { owner: string; userId: string | null }): Promise<StartResponse>;
  appendKeys(input: { owner: string; gameId: string; seq: number; events: TypingEvent[] }): Promise<AppendStatus>;
  finish(input: { owner: string; gameId: string; lastSeq: number; ipHash: string | null }): Promise<FinishOutcome>;
}

export function createGameService(deps: GameServiceDeps): GameService {
  return {
    async start({ owner, userId, language, env }) {
      const words = generateWords(await deps.loadWords(language), WORDS_PER_TEST, deps.random);
      const game = await deps.store.create({ id: deps.newId(), owner, userId, language, words, env, times: deps.times });
      return {
        gameId: game.id,
        words: game.words,
        countdownMs: deps.times.countdownMs,
        durationMs: deps.times.durationMs,
      };
    },

    async appendKeys({ owner, gameId, seq, events }) {
      return deps.store.append(gameId, owner, seq, JSON.stringify(events), events.length);
    },

    async finish({ owner, gameId, lastSeq, ipHash }) {
      const claim = await deps.store.claimFinish(gameId, owner);
      if (claim.kind === "done") return { kind: "ok", response: JSON.parse(claim.result) as FinishResponse };
      if (claim.kind !== "ready") return { kind: claim.kind };

      const { game, finishedAt } = claim;
      const batches: ReceivedBatch[] = claim.batches.map((batch) => ({
        seq: batch.seq,
        arrivedAt: batch.arrivedAt,
        events: JSON.parse(batch.payload) as TypingEvent[],
      }));
      const events = batches.flatMap((batch) => batch.events);

      const inputType = classifyInputType(events, game.env);
      const result = replay(game.words, events, game.durationMs);
      const reason =
        checkTiming(batches, { startsAt: game.startsAt, deadline: game.deadline, finishedAt, lastSeq }) ??
        checkEvents(events, inputType) ??
        checkSpeed(result.wpm, inputType);
      const verdict = reason ? "rejected" : "valid";
      let saved: SavedGame;
      try {
        saved = await deps.saveGame({
          id: gameId,
          userId: game.userId,
          anonId: owner,
          language: game.language,
          inputType,
          wpm: result.wpm,
          rawWpm: result.rawWpm,
          accuracy: result.accuracy,
          verdict,
          rejectReason: reason,
          ipHash,
          startsAt: new Date(game.startsAt),
          finishedAt: new Date(finishedAt),
          words: game.words,
          batches,
        });
      } catch (error) {
        await deps.store.release(gameId);
        throw error;
      }

      // En `review` no se toca Redis: sus posiciones ya salen de PostgreSQL (spec 4b §2.2). Si no, ya
      // guardada: si el ranking falla, `rankGame` responde `unavailable` y la partida se da igual.
      const ranking: GameRanking = saved.review
        ? { kind: "review", ...saved.review }
        : await deps.rankGame({
            userId: game.userId,
            language: game.language,
            inputType,
            verdict,
            wpm: result.wpm,
            accuracy: result.accuracy,
            startsAt: new Date(game.startsAt),
            improved: saved.improved,
          });

      const response: FinishResponse = {
        ...result,
        gameId,
        inputType,
        verdict: saved.review ? "review" : verdict,
        reason: reason ? PUBLIC_REASON[reason] : null,
        ranking,
      };
      await deps.store.complete(gameId, JSON.stringify(response));
      return { kind: "ok", response };
    },
  };
}
