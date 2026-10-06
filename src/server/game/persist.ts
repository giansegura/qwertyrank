import "server-only";
import { gzipSync } from "node:zlib";
import type { InputType, RejectReason, Verdict } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import type { ReceivedBatch } from "../anticheat/rules";

export interface GameRecord {
  id: string;
  userId: string | null;
  anonId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  verdict: Verdict;
  rejectReason: RejectReason | null;
  ipHash: string | null;
  startsAt: Date;
  finishedAt: Date;
  batches: ReceivedBatch[];
}

export type SaveGame = (record: GameRecord) => Promise<void>;

/** Guarda la partida y sus pulsaciones en una sola transacción. */
export function createSaveGame(db: Db): SaveGame {
  return async ({ batches, ...game }) => {
    await db.transaction(async (tx) => {
      await tx.insert(games).values(game);
      await tx.insert(keystrokeLogs).values({
        gameId: game.id,
        events: gzipSync(JSON.stringify(batches)),
      });
    });
  };
}
