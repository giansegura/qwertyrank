import type { InputType } from "./game/types";
import type { TestLanguage } from "./words/languages";

export interface ProfileRecord {
  /** The record's game: its result page (spec 5d §7). */
  gameId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
}

export interface ProfileGame {
  id: string;
  startsAt: Date;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  accuracy: number;
}

export interface PublicProfile {
  nick: string;
  country: string | null;
  memberSince: Date;
  records: ProfileRecord[];
  history: ProfileGame[];
}

/** The profile as it arrives in JSON (`GET /api/profile`): the dates are text. */
export type ProfileJson = Omit<PublicProfile, "memberSince" | "history"> & {
  memberSince: string;
  history: (Omit<ProfileGame, "startsAt"> & { startsAt: string })[];
};

export function profileFromJson(data: ProfileJson): PublicProfile {
  return {
    ...data,
    memberSince: new Date(data.memberSince),
    history: data.history.map((game) => ({ ...game, startsAt: new Date(game.startsAt) })),
  };
}
