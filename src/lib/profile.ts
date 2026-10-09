import type { InputType } from "./game/types";
import type { TestLanguage } from "./words/languages";

export interface ProfileRecord {
  /** La partida de la marca: su página de resultado (spec 5d §7). */
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

/** El perfil tal como llega en JSON (`GET /api/profile`): las fechas son texto. */
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
