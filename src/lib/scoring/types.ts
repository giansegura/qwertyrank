/** Physical or virtual keystroke. `t` = ms since the start of the game. */
export interface KeyTypingEvent {
  t: number;
  type: "down" | "up";
  key: string;
  code: string;
  trusted: boolean;
}

/**
 * Change in the typed text: first `deleted` characters are removed from the end
 * of the current word and then those of `inserted` are inserted (a space, or
 * any other whitespace, commits the word).
 */
export interface InputTypingEvent {
  t: number;
  type: "input";
  deleted: number;
  inserted: string;
  trusted: boolean;
}

export type TypingEvent = KeyTypingEvent | InputTypingEvent;
