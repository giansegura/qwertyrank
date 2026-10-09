import type { TestLanguage } from "@/lib/words/languages";
import type { InputType } from "./types";

/** A public game (spec 5d §2), as rendered by its page, its image and its player's 404. */
export interface GameResult {
  id: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
  startsAt: Date;
  /** `null` if the game is anonymous. */
  player: { nick: string; country: string | null } | null;
}

/** The game as it arrives in JSON (`GET /api/game/{id}/result`): the date is text. */
export type GameResultJson = Omit<GameResult, "startsAt"> & { startsAt: string };

export function resultFromJson(data: GameResultJson): GameResult {
  return { ...data, startsAt: new Date(data.startsAt) };
}

const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether the text can be a game id (a UUID like the ones the server generates): if not, it is not even queried. */
export function isGameId(value: string): boolean {
  return GAME_ID.test(value);
}
