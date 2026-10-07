import "server-only";
import type {
  FinishResponse,
  PublicReason,
  RejectReason,
  StartRequest,
  StartResponse,
  VerificationFinishResponse,
} from "@/lib/game/types";
import { replay } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import type { VerificationOutcome } from "@/lib/verification";
import { generateWords } from "@/lib/words/generate";
import { WORDS_PER_TEST, type TestLanguage } from "@/lib/words/languages";
import { classifyInputType } from "../anticheat/input-type";
import { checkEvents, checkSpeed, checkTiming, type ReceivedBatch } from "../anticheat/rules";
import type { GameRanking } from "@/lib/leaderboard/types";
import type { RankGameInput } from "../leaderboard/ranking";
import type { PublishedGame, SaveVerificationGame, VerificationResult } from "../verification/finish";
import type { GameRecord, SaveGame, SavedGame } from "./persist";
import type { AppendStatus, GameStore, GameTimes, StartedVerification } from "./store";

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
  /** Guarda y juzga una partida de verificación (spec 4b §3.3). */
  saveVerificationGame: SaveVerificationGame;
  loadWords: (language: TestLanguage) => Promise<readonly string[]>;
  random: () => number;
  newId: () => string;
  times: GameTimes;
  /** Publica las marcas y calcula las posiciones (spec §5.5–5.6); no lanza. */
  rankGame: (game: RankGameInput) => Promise<GameRanking>;
}

export type FinishOutcome =
  | { kind: "ok"; response: FinishResponse | VerificationFinishResponse }
  | { kind: "busy" | "closed" | "not_found" };

export interface GameService {
  /** Con `verification`, una partida de verificación de un intento ya gastado (spec 4b §3.1). */
  start(
    input: Pick<StartRequest, "language" | "env"> & {
      owner: string;
      userId: string | null;
      verification?: StartedVerification;
    },
  ): Promise<StartResponse>;
  appendKeys(input: { owner: string; gameId: string; seq: number; events: TypingEvent[] }): Promise<AppendStatus>;
  finish(input: { owner: string; gameId: string; lastSeq: number; ipHash: string | null }): Promise<FinishOutcome>;
}

const rankInput = (game: PublishedGame): RankGameInput => ({ ...game, verdict: "valid" });

export function createGameService(deps: GameServiceDeps): GameService {
  /** Guarda la partida; si falla, la deja lista para repetir el final. */
  async function save<T>(gameId: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      await deps.store.release(gameId);
      throw error;
    }
  }

  /**
   * Tras publicar el récord (spec 4b §3.3), cada partida publicada pasa por el ranking como una partida
   * más: ZADD de lo que mejora (salvo shadow-ban), autorreparado, relectura del estado y revalidación.
   * La del récord va la última: sus posiciones son las de la respuesta.
   */
  async function rankVerified({ target, published }: Extract<VerificationResult, { kind: "verified" }>): Promise<GameRanking> {
    for (const game of published) {
      if (game.gameId !== target.gameId) await deps.rankGame(rankInput(game));
    }
    return deps.rankGame(rankInput(target));
  }

  return {
    async start({ owner, userId, language, env, verification }) {
      const words = generateWords(await deps.loadWords(language), WORDS_PER_TEST, deps.random);
      const game = await deps.store.create({
        id: deps.newId(),
        owner,
        userId,
        language,
        words,
        env,
        times: deps.times,
        verification,
      });
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
      if (claim.kind === "done") {
        return { kind: "ok", response: JSON.parse(claim.result) as FinishResponse | VerificationFinishResponse };
      }
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
      const record: GameRecord = {
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
      };
      const base: Omit<FinishResponse, "ranking"> = {
        ...result,
        gameId,
        inputType,
        verdict,
        reason: reason ? PUBLIC_REASON[reason] : null,
      };

      // Partida de verificación (spec 4b §3.3): en lugar de `ranking`, si ha superado la verificación.
      const started = game.verification;
      if (started) {
        const outcome = await save(gameId, () => deps.saveVerificationGame(record, started));
        const verification: VerificationOutcome =
          outcome.kind === "failed" ? outcome : { kind: "verified", ranking: await rankVerified(outcome) };
        const response: VerificationFinishResponse = { ...base, verification };
        await deps.store.complete(gameId, JSON.stringify(response));
        return { kind: "ok", response };
      }

      const saved: SavedGame = await save(gameId, () => deps.saveGame(record));
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

      const response: FinishResponse = { ...base, verdict: saved.review ? "review" : verdict, ranking };
      await deps.store.complete(gameId, JSON.stringify(response));
      return { kind: "ok", response };
    },
  };
}
