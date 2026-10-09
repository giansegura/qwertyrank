import type { TestLanguage } from "@/lib/words/languages";
import type { InputType } from "./types";

/** Una partida pública (spec 5d §2), tal como la pintan su página, su imagen y la 404 de su jugador. */
export interface GameResult {
  id: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
  startsAt: Date;
  /** `null` si la partida es anónima. */
  player: { nick: string; country: string | null } | null;
}

/** La partida tal como llega en JSON (`GET /api/game/{id}/result`): la fecha es texto. */
export type GameResultJson = Omit<GameResult, "startsAt"> & { startsAt: string };

export function resultFromJson(data: GameResultJson): GameResult {
  return { ...data, startsAt: new Date(data.startsAt) };
}

const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Si el texto puede ser el id de una partida (un UUID como los que genera el servidor): si no, ni se consulta. */
export function isGameId(value: string): boolean {
  return GAME_ID.test(value);
}
